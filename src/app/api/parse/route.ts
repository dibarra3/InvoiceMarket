import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

type InventoryItemLike = {
  key: string;
  label: string;
  unit: string;
  rate: number;
};

type ParsedLineItem = {
  label: string;
  qty: number;
  unit: string;
  rate: number;
};

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "record_job",
  description: "Records the client, line items, and discount extracted from a landscaping/excavation job note.",
  input_schema: {
    type: "object",
    properties: {
      clientName: {
        type: ["string", "null"],
        description: "The client's name or job name, e.g. 'Jones'. Null if not mentioned.",
      },
      clientAddress: {
        type: ["string", "null"],
        description: "The job site street address, e.g. '123 Main St'. Null if not mentioned.",
      },
      lineItems: {
        type: "array",
        description:
          "Billable line items mentioned in the notes. Prefer matching against the provided price list by key when the work matches; invent a reasonable label/unit/rate for anything billable that isn't on the list.",
        items: {
          type: "object",
          properties: {
            inventoryKey: {
              type: ["string", "null"],
              description: "Key of the matching price-list item, or null if this item isn't on the list.",
            },
            label: { type: "string" },
            qty: { type: "number" },
            unit: { type: "string" },
            rate: { type: "number", description: "Dollar rate per unit." },
          },
          required: ["label", "qty", "unit", "rate"],
        },
      },
      discountPercent: {
        type: "number",
        description: "Discount percent mentioned, 0 if none.",
      },
      discountLabel: {
        type: "string",
        description: "Short label for the discount reason, e.g. 'Military Discount'. Empty string if no discount.",
      },
    },
    required: ["clientName", "clientAddress", "lineItems", "discountPercent", "discountLabel"],
  },
};

function sanitizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Coerces and filters whatever Claude returned for lineItems into something safe to persist —
 * drops entries missing a usable label or with non-finite/nonsensical numbers instead of
 * letting bad data reach the database or crash the form. */
function sanitizeLineItems(raw: unknown, inventoryByKey: Map<string, InventoryItemLike>): ParsedLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ParsedLineItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const inventoryKey = typeof e.inventoryKey === "string" ? e.inventoryKey : null;
    const matched = inventoryKey ? inventoryByKey.get(inventoryKey) : undefined;

    const label = matched?.label ?? sanitizeString(e.label);
    if (!label) continue;

    const qty = Number(e.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const rate = matched?.rate ?? Number(e.rate);
    if (!Number.isFinite(rate) || rate < 0) continue;

    const unitRaw = matched?.unit ?? sanitizeString(e.unit);
    const unit = unitRaw ?? "each";

    items.push({ label, qty, unit, rate });
  }

  return items;
}

function sanitizeDiscountPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env to enable Magic Parse." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const inventory: InventoryItemLike[] = Array.isArray(body?.inventory) ? body.inventory : [];

  if (!notes) {
    return NextResponse.json({ error: "No job notes provided." }, { status: 400 });
  }

  const priceListText = inventory
    .map((i) => `- ${i.key}: "${i.label}", unit=${i.unit}, rate=$${i.rate}`)
    .join("\n");

  const client = new Anthropic({ apiKey });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "record_job" },
      messages: [
        {
          role: "user",
          content: `Extract the job details from these freeform notes from a landscaping/excavation crew.

Price list to match against:
${priceListText || "(no price list configured)"}

Job notes:
"""
${notes}
"""`,
        },
      ],
    });
  } catch (err) {
    console.error("Claude request failed", err);
    return NextResponse.json(
      { error: "Couldn't reach Claude to parse your notes. Try again in a moment." },
      { status: 502 }
    );
  }

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    return NextResponse.json(
      { error: "Claude didn't return structured data — try rephrasing your notes." },
      { status: 502 }
    );
  }

  // Claude's output is only as trustworthy as its schema adherence — treat `input` as
  // unknown and sanitize every field rather than casting and trusting the shape.
  try {
    const input = toolUse.input as Record<string, unknown>;
    const inventoryByKey = new Map(inventory.map((i) => [i.key, i]));

    const clientName = sanitizeString(input.clientName);
    const clientAddress = sanitizeString(input.clientAddress);
    const lineItems = sanitizeLineItems(input.lineItems, inventoryByKey);
    const discountPercent = sanitizeDiscountPercent(input.discountPercent);
    const discountLabel = discountPercent > 0 ? (sanitizeString(input.discountLabel) ?? "Discount") : "";

    const foundNothing = lineItems.length === 0 && !clientName && !discountPercent;

    const bits: string[] = [];
    bits.push(`${lineItems.length} line item${lineItems.length === 1 ? "" : "s"}`);
    if (clientName) bits.push(`client "${clientName}"`);
    if (discountPercent) bits.push(`a ${discountPercent}% discount`);

    return NextResponse.json({
      clientName,
      clientAddress,
      lineItems,
      discountPercent,
      discountLabel,
      summary: foundNothing
        ? "Claude couldn't find anything to extract from those notes — try adding more detail."
        : `Parsed ${bits.join(", ")} from your notes via Claude.`,
      foundNothing,
    });
  } catch (err) {
    console.error("Failed to interpret Claude's parse result", err);
    return NextResponse.json(
      { error: "Claude returned data in an unexpected shape — try rephrasing your notes." },
      { status: 502 }
    );
  }
}
