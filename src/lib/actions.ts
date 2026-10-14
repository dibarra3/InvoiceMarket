"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireCompanyId, requireOwner, requireSession } from "./session";
import { DocumentStatus, DocumentType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { computeTotals } from "./totals";
import { invalidateCheckout } from "./checkout";
import { UserFacingError, actionError, type ActionResult } from "./errors";
import type {
  ClientRecord,
  CompanyRecord,
  DocumentRecord,
  InventoryItemRecord,
} from "./types";

const documentInclude = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.DocumentInclude;

type DocumentWithItems = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

function serializeDocument(doc: DocumentWithItems): DocumentRecord {
  return {
    id: doc.id,
    type: doc.type,
    docNumber: doc.docNumber,
    status: doc.status,
    date: doc.date.toISOString(),
    dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
    clientId: doc.clientId,
    clientName: doc.clientName,
    clientAddress: doc.clientAddress,
    clientEmail: doc.clientEmail,
    notesText: doc.notesText,
    discountPercent: doc.discountPercent,
    discountLabel: doc.discountLabel,
    taxRate: doc.taxRate,
    footerNote: doc.footerNote,
    stripePaymentLinkUrl: doc.stripePaymentLinkUrl,
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    sentAt: doc.sentAt ? doc.sentAt.toISOString() : null,
    lineItems: doc.lineItems.map((li) => ({
      id: li.id,
      label: li.label,
      qty: li.qty,
      unit: li.unit,
      rate: li.rate,
      sortOrder: li.sortOrder,
    })),
  };
}

// ---------- Company ----------

export async function getCompany(): Promise<CompanyRecord> {
  const companyId = await requireCompanyId();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  return {
    id: company.id,
    name: company.name,
    logoUrl: company.logoUrl,
    defaultTaxRate: company.defaultTaxRate,
    defaultFooter: company.defaultFooter,
  };
}

export async function updateCompany(patch: {
  name?: string;
  logoUrl?: string | null;
  defaultTaxRate?: number;
  defaultFooter?: string;
}): Promise<CompanyRecord> {
  const companyId = await requireOwner();
  const company = await prisma.company.update({
    where: { id: companyId },
    data: pickFields(patch, ["name", "logoUrl", "defaultTaxRate", "defaultFooter"]),
  });
  revalidatePath("/settings");
  revalidatePath("/editor");
  return {
    id: company.id,
    name: company.name,
    logoUrl: company.logoUrl,
    defaultTaxRate: company.defaultTaxRate,
    defaultFooter: company.defaultFooter,
  };
}

// ---------- Clients ----------

export async function listClients(): Promise<ClientRecord[]> {
  const companyId = await requireCompanyId();
  const clients = await prisma.client.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: { documents: { include: documentInclude } },
  });
  return clients.map((c) => {
    const lifetime = c.documents.reduce((sum, doc) => {
      const totals = computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate);
      return sum + totals.total;
    }, 0);
    return {
      id: c.id,
      name: c.name,
      address: c.address,
      email: c.email,
      phone: c.phone,
      jobCount: c.documents.length,
      lifetime,
    };
  });
}

/** Finds a client by case-insensitive name within the current company, or creates one. Used
 * to keep the Clients page in sync with whatever name/address/email a document editor types
 * in, without forcing users through a separate "pick a client" step. */
async function findOrCreateClient(companyId: string, name: string, address: string, email?: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const existing = await prisma.client.findFirst({
    where: { companyId, name: { equals: trimmedName, mode: "insensitive" } },
  });
  const trimmedEmail = email?.trim();
  if (existing) {
    const data: Prisma.ClientUpdateInput = {};
    if (address && address.trim() && address.trim() !== existing.address) data.address = address.trim();
    if (trimmedEmail && trimmedEmail !== existing.email) data.email = trimmedEmail;
    if (Object.keys(data).length === 0) return existing;
    return prisma.client.update({ where: { id: existing.id }, data });
  }
  return prisma.client.create({
    data: { companyId, name: trimmedName, address: address.trim(), email: trimmedEmail || null },
  });
}

export async function createClient(data: {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
}): Promise<void> {
  const companyId = await requireCompanyId();
  await prisma.client.create({
    data: {
      companyId,
      name: data.name.trim(),
      address: data.address?.trim() ?? "",
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
  });
  revalidatePath("/clients");
}

// ---------- Documents ----------

export async function listDocuments(): Promise<DocumentRecord[]> {
  const companyId = await requireCompanyId();
  const docs = await prisma.document.findMany({
    where: { companyId },
    orderBy: { date: "desc" },
    include: documentInclude,
  });
  return docs.map(serializeDocument);
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const companyId = await requireCompanyId();
  const doc = await prisma.document.findFirst({
    where: { id, companyId },
    include: documentInclude,
  });
  return doc ? serializeDocument(doc) : null;
}

async function nextDocNumber(companyId: string, type: DocumentType): Promise<string> {
  if (type === DocumentType.ESTIMATE) {
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { nextEstimateSeq: { increment: 1 } },
    });
    return `EST-${updated.nextEstimateSeq - 1}`;
  }
  const updated = await prisma.company.update({
    where: { id: companyId },
    data: { nextInvoiceSeq: { increment: 1 } },
  });
  return `INV-${updated.nextInvoiceSeq - 1}`;
}

/** Called while rendering /editor, so it must not revalidate: Next.js rejects revalidatePath
 * during render. /invoices is force-dynamic and always shows new drafts anyway. */
export async function createDocument(type: DocumentType): Promise<string> {
  const companyId = await requireCompanyId();
  const company = await getCompany();
  const docNumber = await nextDocNumber(companyId, type);
  const today = new Date();
  const dueDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
  const doc = await prisma.document.create({
    data: {
      companyId,
      type,
      docNumber,
      status: DocumentStatus.DRAFT,
      date: today,
      dueDate,
      taxRate: company.defaultTaxRate,
      footerNote: company.defaultFooter,
    },
  });
  return doc.id;
}

export type DocumentPatch = Partial<{
  type: DocumentType;
  status: DocumentStatus;
  date: string;
  dueDate: string | null;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  notesText: string;
  discountPercent: number;
  discountLabel: string;
  taxRate: number;
  footerNote: string;
  docNumber: string;
}>;

const LOCKED_MESSAGE =
  "This document is locked because it's been sent or paid — duplicate it as a new draft to make changes.";

/** Fields that affect the document's identity or its totals — once a document has left
 * DRAFT (sent or paid), these can never be edited in place; only line items and totals-
 * affecting fields (discount/tax) are locked this way, per `assertOwnsDraftDocument` below. */
const LOCKED_ON_SENT_FIELDS = ["type", "docNumber", "discountPercent", "discountLabel", "taxRate"] as const;

/** Throws if the document doesn't belong to the current company — call before any
 * document/line-item mutation so a company can never touch another company's data. */
async function assertOwnsDocument(companyId: string, documentId: string) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
  if (!doc) throw new Error("Document not found");
  return doc;
}

/** Like `assertOwnsDocument`, but also throws once the document has been sent or paid —
 * use before any mutation that touches line items or totals. */
async function assertOwnsDraftDocument(companyId: string, documentId: string) {
  const doc = await assertOwnsDocument(companyId, documentId);
  if (doc.status !== DocumentStatus.DRAFT) throw new Error(LOCKED_MESSAGE);
  return doc;
}

const DOCUMENT_PATCH_FIELDS = [
  "type",
  "status",
  "date",
  "dueDate",
  "clientName",
  "clientAddress",
  "clientEmail",
  "notesText",
  "discountPercent",
  "discountLabel",
  "taxRate",
  "footerNote",
  "docNumber",
] as const satisfies readonly (keyof DocumentPatch)[];

/** Server Actions accept arbitrary client payloads regardless of their TypeScript types, so
 * copy only known-editable keys — never e.g. `companyId`, `paidAt`, or Stripe/guest fields. */
function pickFields<T extends object, K extends keyof T>(input: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (input && Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

export async function updateDocument(id: string, rawPatch: DocumentPatch): Promise<void> {
  const { companyId, role } = await requireSession();
  const current = await assertOwnsDocument(companyId, id);
  const patch = pickFields(rawPatch, DOCUMENT_PATCH_FIELDS);

  const locked = current.status !== DocumentStatus.DRAFT;
  if (locked && LOCKED_ON_SENT_FIELDS.some((field) => patch[field] !== undefined)) {
    throw new UserFacingError(LOCKED_MESSAGE);
  }
  const statusChanged = patch.status !== undefined && patch.status !== current.status;
  if (statusChanged && role !== "OWNER") {
    throw new UserFacingError("Only the company owner can change a document's status.");
  }

  // Reopening a document for edits, or settling it outside Stripe, first kills its payment
  // link so the old (possibly wrong) amount can't be paid. If Stripe can't confirm that, this
  // throws and the status change below never happens.
  if (statusChanged && patch.status !== DocumentStatus.SENT) await invalidateCheckout(id);

  const data: Prisma.DocumentUpdateInput = { ...patch };
  if (patch.date !== undefined) data.date = new Date(patch.date);
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;

  if (patch.clientName !== undefined) {
    const client = await findOrCreateClient(
      companyId,
      patch.clientName,
      patch.clientAddress ?? current.clientAddress,
      patch.clientEmail ?? current.clientEmail
    );
    data.client = client ? { connect: { id: client.id } } : { disconnect: true };
  }

  await prisma.document.update({ where: { id }, data });
  revalidatePath("/invoices");
  revalidatePath("/clients");
  revalidatePath(`/editor/${id}`);
}

/** Status changes from the Editor, returned as a result so a refusal (e.g. Stripe couldn't
 * confirm the payment link was cancelled) reaches the UI even in production builds. */
export async function changeDocumentStatus(id: string, status: DocumentStatus): Promise<ActionResult> {
  try {
    await updateDocument(id, { status });
    return { ok: true };
  } catch (err) {
    return actionError(err, "Couldn't change the status.");
  }
}

export async function addLineItem(documentId: string): Promise<string> {
  const companyId = await requireCompanyId();
  await assertOwnsDraftDocument(companyId, documentId);

  const count = await prisma.lineItem.count({ where: { documentId } });
  const item = await prisma.lineItem.create({
    data: { documentId, label: "New Item", qty: 1, unit: "each", rate: 0, sortOrder: count },
  });
  revalidatePath(`/editor/${documentId}`);
  return item.id;
}

export async function updateLineItem(
  id: string,
  patch: Partial<{ label: string; qty: number; unit: string; rate: number }>
): Promise<void> {
  const companyId = await requireCompanyId();
  const item = await prisma.lineItem.findFirst({
    where: { id, document: { companyId } },
    include: { document: { select: { status: true } } },
  });
  if (!item) throw new Error("Line item not found");
  if (item.document.status !== DocumentStatus.DRAFT) throw new Error(LOCKED_MESSAGE);

  await prisma.lineItem.update({ where: { id }, data: pickFields(patch, ["label", "qty", "unit", "rate"]) });
  revalidatePath(`/editor/${item.documentId}`);
  revalidatePath("/clients");
  revalidatePath("/invoices");
}

export async function removeLineItem(id: string): Promise<void> {
  const companyId = await requireCompanyId();
  const item = await prisma.lineItem.findFirst({
    where: { id, document: { companyId } },
    include: { document: { select: { status: true } } },
  });
  if (!item) throw new Error("Line item not found");
  if (item.document.status !== DocumentStatus.DRAFT) throw new Error(LOCKED_MESSAGE);

  await prisma.lineItem.delete({ where: { id } });
  revalidatePath(`/editor/${item.documentId}`);
  revalidatePath("/clients");
  revalidatePath("/invoices");
}

/** Copies a document (including line items) into a brand-new DRAFT with a fresh doc number —
 * the escape hatch for editing a sent/paid document's content without altering the original. */
export async function duplicateDocument(id: string): Promise<string> {
  const companyId = await requireCompanyId();
  const source = await prisma.document.findFirst({
    where: { id, companyId },
    include: documentInclude,
  });
  if (!source) throw new Error("Document not found");

  const docNumber = await nextDocNumber(companyId, source.type);
  const today = new Date();
  const dueDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

  const copy = await prisma.document.create({
    data: {
      companyId,
      type: source.type,
      docNumber,
      status: DocumentStatus.DRAFT,
      date: today,
      dueDate,
      clientId: source.clientId,
      clientName: source.clientName,
      clientAddress: source.clientAddress,
      clientEmail: source.clientEmail,
      notesText: source.notesText,
      discountPercent: source.discountPercent,
      discountLabel: source.discountLabel,
      taxRate: source.taxRate,
      footerNote: source.footerNote,
      lineItems: {
        create: source.lineItems.map((li) => ({
          label: li.label,
          qty: li.qty,
          unit: li.unit,
          rate: li.rate,
          sortOrder: li.sortOrder,
        })),
      },
    },
  });

  revalidatePath("/invoices");
  return copy.id;
}

/** Owner-only: permanently removes a document and its line items — but only after its
 * payment link is confirmed cancelled, so a deleted invoice can never be paid. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  try {
    const companyId = await requireOwner();
    const doc = await prisma.document.findFirst({ where: { id, companyId } });
    if (!doc) throw new UserFacingError("Document not found.");

    await invalidateCheckout(id);
    await prisma.document.delete({ where: { id } });
    revalidatePath("/invoices");
    revalidatePath("/clients");
    return { ok: true };
  } catch (err) {
    return actionError(err, "Couldn't delete this document.");
  }
}

/** Applies a Magic Parse result: updates client/discount fields and replaces all line items
 * in a single transaction so the preview never shows a half-applied state. */
export async function applyParseResult(
  documentId: string,
  result: {
    clientName: string | null;
    clientAddress: string | null;
    lineItems: { label: string; qty: number; unit: string; rate: number }[];
    discountPercent: number;
    discountLabel: string;
  }
): Promise<DocumentRecord> {
  const companyId = await requireCompanyId();
  const current = await assertOwnsDraftDocument(companyId, documentId);

  const finalName = result.clientName ?? current.clientName;
  const finalAddress = result.clientAddress ?? current.clientAddress;
  const client = await findOrCreateClient(companyId, finalName, finalAddress);

  await prisma.$transaction([
    prisma.lineItem.deleteMany({ where: { documentId } }),
    ...(result.lineItems.length
      ? [
          prisma.lineItem.createMany({
            data: result.lineItems.map((li, idx) => ({
              documentId,
              label: li.label,
              qty: li.qty,
              unit: li.unit,
              rate: li.rate,
              sortOrder: idx,
            })),
          }),
        ]
      : []),
    prisma.document.update({
      where: { id: documentId },
      data: {
        clientName: finalName,
        clientAddress: finalAddress,
        discountPercent: result.discountPercent,
        discountLabel: result.discountLabel,
        client: client ? { connect: { id: client.id } } : undefined,
      },
    }),
  ]);

  revalidatePath(`/editor/${documentId}`);
  revalidatePath("/clients");
  revalidatePath("/invoices");

  const updated = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: documentInclude,
  });
  return serializeDocument(updated);
}

// ---------- Inventory (price list) ----------

export async function listInventory(): Promise<InventoryItemRecord[]> {
  const companyId = await requireCompanyId();
  const items = await prisma.inventoryItem.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  return items.map((i) => ({
    id: i.id,
    key: i.key,
    label: i.label,
    unit: i.unit,
    rate: i.rate,
    matchTerm: i.matchTerm,
  }));
}
