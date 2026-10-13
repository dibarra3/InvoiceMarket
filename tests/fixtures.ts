import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerCustomer } from "@/lib/customer-portal";
import { DocumentStatus, DocumentType } from "@/generated/prisma/enums";

/** Unique per test run, so fixtures never collide with (or clean up) anyone else's rows. */
export const RUN = randomBytes(4).toString("hex");

const companyIds: string[] = [];
const customerIds: string[] = [];

export async function makeCompany(name = "Test Co") {
  const company = await prisma.company.create({
    data: {
      name: `${name} ${RUN}`,
      users: { create: { email: `owner-${RUN}-${randomBytes(3).toString("hex")}@test.local`, passwordHash: "x" } },
    },
  });
  companyIds.push(company.id);
  return company;
}

export async function makeClient(companyId: string, name: string, email?: string) {
  return prisma.client.create({ data: { companyId, name, email: email ?? null } });
}

type DocOptions = {
  clientId?: string | null;
  clientName?: string;
  docNumber?: string;
  status?: DocumentStatus;
  type?: DocumentType;
  items?: { label: string; qty: number; rate: number }[];
  discountPercent?: number;
  taxRate?: number;
  notesText?: string;
};

export async function makeDocument(companyId: string, opts: DocOptions = {}) {
  return prisma.document.create({
    data: {
      companyId,
      type: opts.type ?? DocumentType.INVOICE,
      status: opts.status ?? DocumentStatus.SENT,
      docNumber: opts.docNumber ?? `INV-${randomBytes(3).toString("hex")}`,
      clientId: opts.clientId ?? null,
      clientName: opts.clientName ?? "",
      discountPercent: opts.discountPercent ?? 0,
      taxRate: opts.taxRate ?? 0,
      notesText: opts.notesText ?? "",
      lineItems: {
        create: (opts.items ?? [{ label: "Labor", qty: 2, rate: 75 }]).map((li, i) => ({ ...li, unit: "each", sortOrder: i })),
      },
    },
  });
}

export async function makeCustomer(email = `customer-${RUN}-${randomBytes(3).toString("hex")}@test.local`) {
  const customer = await registerCustomer({ name: "Test Customer", email, password: "correct-horse-1" });
  customerIds.push(customer.id);
  return customer;
}

export function trackCustomer(id: string) {
  customerIds.push(id);
}

/** Deletes only what this run created. Payments are removed by session-id prefix since their
 * document link is SET NULL on delete. */
export async function cleanup() {
  await prisma.payment.deleteMany({ where: { stripeCheckoutSessionId: { startsWith: `cs_test_${RUN}_` } } });
  await prisma.payment.deleteMany({ where: { document: { companyId: { in: companyIds } } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  companyIds.length = 0;
  customerIds.length = 0;
}

// ---------- Stripe fakes ----------

type FakeSession = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid";
  mode: "payment";
  amount_total: number;
  currency: string;
  metadata: Record<string, string>;
  url: string | null;
  success_url: string;
  cancel_url: string;
  livemode: boolean;
  payment_intent: string | null;
};

type StripeCall = "retrieve" | "expire";

/** Shaped like the Stripe SDK's errors: only `resource_missing` proves a session is gone. */
function stripeError(message: string, code: string | undefined, type: string) {
  return Object.assign(new Error(message), { code, type });
}

/** In-memory stand-in for the three Checkout Session endpoints the app uses. Add a call to
 * `outage` to make it fail like a network/API error until removed. */
export function makeFakeStripe() {
  const sessions = new Map<string, FakeSession>();
  const outage = new Set<StripeCall>();
  const transient = () => stripeError("Connection reset by peer", undefined, "StripeConnectionError");
  let n = 0;
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    const line = params.line_items![0];
    const id = `cs_test_${RUN}_${++n}_${randomBytes(3).toString("hex")}`;
    const session: FakeSession = {
      id,
      object: "checkout.session",
      status: "open",
      payment_status: "unpaid",
      mode: "payment",
      amount_total: line.price_data!.unit_amount! * (line.quantity ?? 1),
      currency: line.price_data!.currency,
      metadata: { ...(params.metadata as Record<string, string>) },
      url: `https://checkout.stripe.test/${id}`,
      success_url: params.success_url!,
      cancel_url: params.cancel_url!,
      livemode: false,
      payment_intent: null,
    };
    sessions.set(id, session);
    return { ...session };
  });
  const retrieve = vi.fn(async (id: string) => {
    if (outage.has("retrieve")) throw transient();
    const s = sessions.get(id);
    if (!s) throw stripeError(`No such checkout.session: '${id}'`, "resource_missing", "StripeInvalidRequestError");
    return { ...s };
  });
  const expire = vi.fn(async (id: string) => {
    if (outage.has("expire")) throw transient();
    const s = sessions.get(id);
    if (!s) throw stripeError(`No such checkout.session: '${id}'`, "resource_missing", "StripeInvalidRequestError");
    if (s.status !== "open") {
      throw stripeError("Only Checkout Sessions with a status of open can be expired.", undefined, "StripeInvalidRequestError");
    }
    s.status = "expired";
    s.url = null;
    return { ...s };
  });

  return {
    stripe: { checkout: { sessions: { create, retrieve, expire } } } as unknown as Stripe,
    create,
    retrieve,
    expire,
    sessions,
    outage,
    /** Simulates the payer finishing Checkout (what Stripe would then report via webhook). */
    complete(id: string): FakeSession {
      const s = sessions.get(id)!;
      s.status = "complete";
      s.payment_status = "paid";
      s.payment_intent = `pi_${id}`;
      return { ...s };
    },
  };
}

const signer = new Stripe("sk_test_vitest_dummy");

export function completedEvent(session: Partial<FakeSession> & { id: string }, livemode = false): Stripe.Event {
  return {
    id: `evt_${randomBytes(6).toString("hex")}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
    data: { object: session as unknown as Stripe.Checkout.Session },
  } as Stripe.Event;
}

export function signedWebhookRequest(event: Stripe.Event, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new NextRequest("https://groundwork.test/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": header, "content-type": "application/json" },
  });
}
