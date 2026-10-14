import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { CheckoutError, getOrCreateCheckoutSession, invalidateCheckout } from "@/lib/checkout";
import { ensureGuestAccess } from "@/lib/guest-access";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { GuestInvoicePage } from "@/components/GuestInvoicePage";
import { DocumentStatus, DocumentType, PaymentOutcome } from "@/generated/prisma/enums";
import {
  cleanup,
  completedEvent,
  makeCompany,
  makeDocument,
  makeFakeStripe,
  signedWebhookRequest,
} from "./fixtures";

const ORIGIN = "https://groundwork.test";

// 3 × $150 + 4 × $75 = $750, −10% = $675, +8.25% tax = $730.6875 → 73069¢
const ITEMS = [
  { label: "Bermuda Sod", qty: 3, rate: 150 },
  { label: "Labor", qty: 4, rate: 75 },
];
const EXPECTED_CENTS = 73069;

describe("payments", () => {
  let company: Awaited<ReturnType<typeof makeCompany>>;
  let otherCompany: Awaited<ReturnType<typeof makeCompany>>;

  beforeAll(async () => {
    company = await makeCompany("Pay Co");
    otherCompany = await makeCompany("Other Co");
  });
  afterAll(cleanup);

  const payableInvoice = () => makeDocument(company.id, { items: ITEMS, discountPercent: 10, taxRate: 8.25 });

  async function postWebhook(event: Parameters<typeof signedWebhookRequest>[0], secret?: string) {
    const res = await webhook(signedWebhookRequest(event, secret));
    return { status: res.status, body: await res.json() };
  }

  /** Creates a session for a fresh invoice and has the fake payer complete it. */
  async function paidSessionFor(doc: { id: string }) {
    const fake = makeFakeStripe();
    await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
    const { stripeCheckoutSessionId } = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    return { fake, session: fake.complete(stripeCheckoutSessionId!) };
  }

  describe("creating Checkout Sessions", () => {
    it("charges the server-computed total in USD and returns payers to their invoice page", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      const url = await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);

      const params = fake.create.mock.calls[0][0];
      const { token } = await ensureGuestAccess(company.id, doc.id);
      expect(params.line_items![0].price_data!.unit_amount).toBe(EXPECTED_CENTS);
      expect(params.line_items![0].price_data!.currency).toBe("usd");
      expect(params.line_items![0].price_data!.product_data!.description).toMatch(/TEST MODE/);
      expect(params.metadata).toMatchObject({ documentId: doc.id, companyId: company.id });
      expect(params.success_url).toBe(`${ORIGIN}/invoice/${token}/payment/success?session_id={CHECKOUT_SESSION_ID}`);
      expect(params.cancel_url).toBe(`${ORIGIN}/invoice/${token}/payment/canceled`);
      expect(params.success_url).not.toContain("/editor/");

      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.stripePaymentLinkUrl).toBe(url);
      expect(stored.stripeCheckoutAmount).toBe(EXPECTED_CENTS);
    });

    it("sends signed-in customers back to the customer portal", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      await getOrCreateCheckoutSession(doc.id, { audience: "customer", origin: ORIGIN }, fake.stripe);
      expect(fake.create.mock.calls[0][0].success_url).toBe(
        `${ORIGIN}/customer/invoices/${doc.id}/payment/success?session_id={CHECKOUT_SESSION_ID}`
      );
    });

    it("refuses drafts, estimates, paid invoices, and totals under the $0.50 USD minimum", async () => {
      const fake = makeFakeStripe();
      const cases = [
        await makeDocument(company.id, { status: DocumentStatus.DRAFT }),
        await makeDocument(company.id, { type: DocumentType.ESTIMATE }),
        await makeDocument(company.id, { status: DocumentStatus.PAID }),
        await makeDocument(company.id, { items: [{ label: "Tiny", qty: 1, rate: 0.49 }] }),
      ];
      for (const doc of cases) {
        await expect(
          getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe)
        ).rejects.toBeInstanceOf(CheckoutError);
      }
      expect(fake.create).not.toHaveBeenCalled();

      const fiftyCents = await makeDocument(company.id, { items: [{ label: "Min", qty: 1, rate: 0.5 }] });
      await expect(
        getOrCreateCheckoutSession(fiftyCents.id, { audience: "guest", origin: ORIGIN }, fake.stripe)
      ).resolves.toMatch(/^https:/);
    });

    it("reuses the open session instead of creating a second one", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      const first = await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      const second = await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      expect(second).toBe(first);
      expect(fake.create).toHaveBeenCalledTimes(1);
    });

    it("expires the old session when the amount or return page changes", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      const firstId = fake.create.mock.results[0].value;
      const { id: firstSessionId } = await firstId;

      await getOrCreateCheckoutSession(doc.id, { audience: "customer", origin: ORIGIN }, fake.stripe);
      expect(fake.expire).toHaveBeenCalledWith(firstSessionId);

      await prisma.lineItem.updateMany({ where: { documentId: doc.id, label: "Labor" }, data: { rate: 80 } });
      await getOrCreateCheckoutSession(doc.id, { audience: "customer", origin: ORIGIN }, fake.stripe);
      expect(fake.create).toHaveBeenCalledTimes(3);
      expect(fake.create.mock.calls[2][0].line_items![0].price_data!.unit_amount).not.toBe(EXPECTED_CENTS);

      const open = [...fake.sessions.values()].filter((s) => s.status === "open");
      expect(open).toHaveLength(1);
    });

    it("won't hand out a new link while a completed payment awaits its webhook", async () => {
      const doc = await payableInvoice();
      const { fake } = await paidSessionFor(doc);
      await expect(
        getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe)
      ).rejects.toThrow(/just completed/);
      expect(fake.create).toHaveBeenCalledTimes(1);
    });

    it("invalidateCheckout expires and forgets the session", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      await invalidateCheckout(doc.id, fake.stripe);
      expect(fake.expire).toHaveBeenCalledTimes(1);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.stripeCheckoutSessionId).toBeNull();
      expect(stored.stripePaymentLinkUrl).toBeNull();
    });
  });

  describe("returning from Checkout", () => {
    it("a canceled checkout leaves the invoice unpaid and the same link reusable", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      const first = await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      // Payer clicks "back" on Stripe → lands on /payment/canceled, which only renders.
      const { token } = await ensureGuestAccess(company.id, doc.id);
      await GuestInvoicePage({ token, result: "canceled" });

      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.status).toBe(DocumentStatus.SENT);
      expect(await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe)).toBe(first);
    });

    it("visiting the success URL never marks the invoice paid by itself", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      const { token } = await ensureGuestAccess(company.id, doc.id);
      await GuestInvoicePage({ token, result: "success" });

      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.status).toBe(DocumentStatus.SENT);
      expect(stored.paidAt).toBeNull();
      expect(await prisma.payment.count({ where: { stripeCheckoutSessionId: session.id } })).toBe(0);
    });
  });

  describe("webhook", () => {
    it("marks the invoice paid for a verified, matching payment", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);

      const res = await postWebhook(completedEvent(session));
      expect(res).toEqual({ status: 200, body: { received: true, outcome: "applied" } });

      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: { payments: true } });
      expect(stored.status).toBe(DocumentStatus.PAID);
      expect(stored.paidAt).not.toBeNull();
      expect(stored.payments).toHaveLength(1);
      expect(stored.payments[0]).toMatchObject({ outcome: PaymentOutcome.APPLIED, amount: EXPECTED_CENTS, currency: "usd" });
    });

    it("treats duplicate deliveries (sequential and concurrent) as a no-op", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      const event = completedEvent(session);

      const [a, b] = await Promise.all([postWebhook(event), postWebhook(event)]);
      const third = await postWebhook(event);
      expect([a.status, b.status, third.status]).toEqual([200, 200, 200]);
      expect([a.body.outcome, b.body.outcome].sort()).toEqual(["applied", "duplicate"]);
      expect(third.body.outcome).toBe("duplicate");
      expect(await prisma.payment.count({ where: { documentId: doc.id } })).toBe(1);
    });

    it("flags a second payment for an already-paid invoice instead of applying it", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      await postWebhook(completedEvent(session));

      const stray = { ...session, id: `${session.id}_second` };
      const res = await postWebhook(completedEvent(stray));
      expect(res.body.outcome).toBe("needs_review");

      const payments = await prisma.payment.findMany({ where: { documentId: doc.id }, orderBy: { createdAt: "asc" } });
      expect(payments.map((p) => p.outcome)).toEqual([PaymentOutcome.APPLIED, PaymentOutcome.NEEDS_REVIEW]);
      expect(payments[1].note).toMatch(/already paid/);
    });

    it.each([
      ["amount", (s: Record<string, unknown>) => ({ ...s, amount_total: 100 }), /doesn't match/],
      ["currency", (s: Record<string, unknown>) => ({ ...s, currency: "eur" }), /currency/],
      ["company", (s: Record<string, unknown>) => ({ ...s, metadata: { ...(s.metadata as object), companyId: "someone-else" } }), /company/],
    ])("does not mark paid when the %s doesn't match", async (_label, tamper, reason) => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      const res = await postWebhook(completedEvent(tamper(session) as typeof session));
      expect(res.body.outcome).toBe("needs_review");

      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: { payments: true } });
      expect(stored.status).toBe(DocumentStatus.SENT);
      expect(stored.payments[0].note).toMatch(reason);
    });

    it("does not mark paid for a session that is no longer the invoice's active link", async () => {
      const doc = await payableInvoice();
      const fake = makeFakeStripe();
      await getOrCreateCheckoutSession(doc.id, { audience: "guest", origin: ORIGIN }, fake.stripe);
      const { id: oldId } = await fake.create.mock.results[0].value;
      await getOrCreateCheckoutSession(doc.id, { audience: "customer", origin: ORIGIN }, fake.stripe);

      // Stripe managed to complete the old session anyway.
      const res = await postWebhook(completedEvent({ ...fake.sessions.get(oldId)!, status: "complete", payment_status: "paid" }));
      expect(res.body.outcome).toBe("needs_review");
      expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe(DocumentStatus.SENT);
    });

    it("ignores unpaid sessions and live-mode events", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);

      expect((await postWebhook(completedEvent({ ...session, payment_status: "unpaid" }))).body.outcome).toBe("ignored");
      expect((await postWebhook(completedEvent({ ...session, livemode: true }, true))).body.outcome).toBe("ignored");
      expect(await prisma.payment.count({ where: { documentId: doc.id } })).toBe(0);
    });

    it("rejects events with a bad signature", async () => {
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      const res = await postWebhook(completedEvent(session), "whsec_wrong_secret");
      expect(res.status).toBe(400);
      expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe(DocumentStatus.SENT);
    });

    it("never touches another company's invoice even with its id in metadata", async () => {
      const victim = await makeDocument(otherCompany.id, { items: ITEMS, discountPercent: 10, taxRate: 8.25 });
      const doc = await payableInvoice();
      const { session } = await paidSessionFor(doc);
      const forged = { ...session, metadata: { ...session.metadata, documentId: victim.id } };
      const res = await postWebhook(completedEvent(forged));
      expect(res.body.outcome).toBe("needs_review");
      expect((await prisma.document.findUniqueOrThrow({ where: { id: victim.id } })).status).toBe(DocumentStatus.SENT);
    });
  });
});
