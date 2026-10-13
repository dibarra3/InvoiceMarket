import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DocumentStatus } from "@/generated/prisma/enums";
import { cleanup, makeCompany, makeDocument, makeFakeStripe } from "./fixtures";

// Server Actions call invalidateCheckout() without a client, so route getStripe() to the fake.
const stripeHolder = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./fixtures").makeFakeStripe> }));
vi.mock("@/lib/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe")>()),
  getStripe: () => stripeHolder.current!.stripe,
}));
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

const { CheckoutUnavailableError, getOrCreateCheckoutSession, invalidateCheckout } = await import("@/lib/checkout");
const { changeDocumentStatus, deleteDocument } = await import("@/lib/actions");
const { getInvoiceAccess, rotateInvoiceAccess } = await import("@/lib/access-actions");

const ORIGIN = "https://groundwork.test";
const guest = { audience: "guest" as const, origin: ORIGIN };

describe("Checkout Sessions whose state Stripe can't confirm", () => {
  let company: Awaited<ReturnType<typeof makeCompany>>;

  beforeAll(async () => {
    company = await makeCompany("Outage Co");
  });
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: "owner", role: "OWNER", companyId: company.id } });
  });
  afterAll(cleanup);

  /** A sent invoice with an open Checkout Session, plus the fake that owns it. */
  async function invoiceWithOpenSession() {
    const fake = makeFakeStripe();
    stripeHolder.current = fake;
    const doc = await makeDocument(company.id);
    const url = await getOrCreateCheckoutSession(doc.id, guest, fake.stripe);
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    fake.create.mockClear();
    fake.expire.mockClear();
    return { fake, doc, url, sessionId: stored.stripeCheckoutSessionId! };
  }

  async function expectReferenceKept(docId: string, sessionId: string, url: string) {
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
    expect(stored.stripeCheckoutSessionId).toBe(sessionId);
    expect(stored.stripePaymentLinkUrl).toBe(url);
    expect(stored.stripeCheckoutAmount).not.toBeNull();
  }

  describe("getOrCreateCheckoutSession", () => {
    it("does not create a replacement when retrieving the current session fails", async () => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      fake.outage.add("retrieve");

      await expect(getOrCreateCheckoutSession(doc.id, guest, fake.stripe)).rejects.toBeInstanceOf(
        CheckoutUnavailableError
      );
      expect(fake.create).not.toHaveBeenCalled();
      expect(fake.expire).not.toHaveBeenCalled();
      await expectReferenceKept(doc.id, sessionId, url);
    });

    it.each([
      ["expire fails, session still open", ["expire"] as const],
      ["expire and the follow-up retrieve both fail", ["expire", "retrieve"] as const],
    ])("does not create a replacement when %s", async (_label, failing) => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      // The customer portal needs a different return page, which forces a replacement.
      fake.retrieve.mockClear();
      const retrieveOk = fake.retrieve.getMockImplementation()!;
      if ((failing as readonly string[]).includes("retrieve")) {
        let calls = 0;
        fake.retrieve.mockImplementation(async (id: string) => {
          if (++calls > 1) throw Object.assign(new Error("timeout"), { type: "StripeConnectionError" });
          return retrieveOk(id);
        });
      }
      fake.outage.add("expire");

      await expect(
        getOrCreateCheckoutSession(doc.id, { audience: "customer", origin: ORIGIN }, fake.stripe)
      ).rejects.toBeInstanceOf(CheckoutUnavailableError);
      expect(fake.create).not.toHaveBeenCalled();
      expect(fake.sessions.get(sessionId)!.status).toBe("open");
      await expectReferenceKept(doc.id, sessionId, url);
    });

    it("replaces a session Stripe confirms is expired", async () => {
      const { fake, doc, sessionId } = await invoiceWithOpenSession();
      fake.sessions.get(sessionId)!.status = "expired";

      const url = await getOrCreateCheckoutSession(doc.id, guest, fake.stripe);
      expect(fake.create).toHaveBeenCalledTimes(1);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.stripeCheckoutSessionId).not.toBe(sessionId);
      expect(stored.stripePaymentLinkUrl).toBe(url);
    });

    it("replaces a session Stripe confirms doesn't exist", async () => {
      const { fake, doc, sessionId } = await invoiceWithOpenSession();
      fake.sessions.delete(sessionId);

      await getOrCreateCheckoutSession(doc.id, guest, fake.stripe);
      expect(fake.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateCheckout", () => {
    it.each([
      ["expire fails, session still open", ["expire"] as const],
      ["expire and retrieve both fail", ["expire", "retrieve"] as const],
    ])("keeps the session reference and throws when %s", async (_label, failing) => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      for (const call of failing) fake.outage.add(call);

      await expect(invalidateCheckout(doc.id, fake.stripe)).rejects.toBeInstanceOf(CheckoutUnavailableError);
      await expectReferenceKept(doc.id, sessionId, url);
    });

    it("keeps the reference and reports a payment that already completed", async () => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      fake.complete(sessionId);

      await expect(invalidateCheckout(doc.id, fake.stripe)).rejects.toThrow(/just completed/);
      await expectReferenceKept(doc.id, sessionId, url);
    });

    it("clears the reference once the session is confirmed expired", async () => {
      const { fake, doc, sessionId } = await invoiceWithOpenSession();
      fake.sessions.get(sessionId)!.status = "expired";

      await invalidateCheckout(doc.id, fake.stripe);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.stripeCheckoutSessionId).toBeNull();
    });
  });

  describe("owner actions stop when invalidation fails", () => {
    it("refuses to move an invoice back to draft", async () => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      fake.outage.add("expire");

      const result = await changeDocumentStatus(doc.id, DocumentStatus.DRAFT);
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/nothing was changed/i) });
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.status).toBe(DocumentStatus.SENT);
      await expectReferenceKept(doc.id, sessionId, url);

      fake.outage.clear();
      expect(await changeDocumentStatus(doc.id, DocumentStatus.DRAFT)).toEqual({ ok: true });
      const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(after.status).toBe(DocumentStatus.DRAFT);
      expect(after.stripeCheckoutSessionId).toBeNull();
      expect(fake.sessions.get(sessionId)!.status).toBe("expired");
    });

    it("refuses to mark an invoice paid manually", async () => {
      const { fake, doc } = await invoiceWithOpenSession();
      fake.outage.add("expire");
      expect((await changeDocumentStatus(doc.id, DocumentStatus.PAID)).ok).toBe(false);
      expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe(DocumentStatus.SENT);
    });

    it("refuses to delete the invoice", async () => {
      const { fake, doc } = await invoiceWithOpenSession();
      fake.outage.add("expire");
      expect((await deleteDocument(doc.id)).ok).toBe(false);
      expect(await prisma.document.findUnique({ where: { id: doc.id } })).not.toBeNull();
    });

    it("refuses to reset the guest link and code", async () => {
      const { fake, doc, url, sessionId } = await invoiceWithOpenSession();
      const before = await getInvoiceAccess(doc.id);
      fake.outage.add("expire");

      expect((await rotateInvoiceAccess(doc.id)).ok).toBe(false);
      expect(await getInvoiceAccess(doc.id)).toEqual(before);
      await expectReferenceKept(doc.id, sessionId, url);
    });
  });
});
