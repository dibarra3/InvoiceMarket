import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getCustomerInvoice,
  issueClientPortalCode,
  listCustomerInvoices,
  listCustomerPayments,
  redeemClientPortalCode,
  unlinkCustomerFromClient,
} from "@/lib/customer-portal";
import { DocumentStatus, DocumentType, PaymentOutcome } from "@/generated/prisma/enums";
import { RUN, cleanup, makeClient, makeCompany, makeCustomer, makeDocument } from "./fixtures";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
const { requireCustomer, requireOwner, requireSession } = await import("@/lib/session");

describe("customer isolation", () => {
  let companyA: Awaited<ReturnType<typeof makeCompany>>;
  let companyB: Awaited<ReturnType<typeof makeCompany>>;
  let jonesA: Awaited<ReturnType<typeof makeClient>>;
  let docs: Record<string, Awaited<ReturnType<typeof makeDocument>>>;

  beforeAll(async () => {
    companyA = await makeCompany("Alpha Landscaping");
    companyB = await makeCompany("Bravo Excavation");
    jonesA = await makeClient(companyA.id, "Jones", `jones-${RUN}@example.com`);
    const smithA = await makeClient(companyA.id, "Smith");
    const jonesB = await makeClient(companyB.id, "Jones", `jones-${RUN}@example.com`);

    docs = {
      sent: await makeDocument(companyA.id, { clientId: jonesA.id, status: DocumentStatus.SENT }),
      paid: await makeDocument(companyA.id, { clientId: jonesA.id, status: DocumentStatus.PAID }),
      estimate: await makeDocument(companyA.id, {
        clientId: jonesA.id,
        status: DocumentStatus.SENT,
        type: DocumentType.ESTIMATE,
      }),
      draft: await makeDocument(companyA.id, { clientId: jonesA.id, status: DocumentStatus.DRAFT }),
      otherClient: await makeDocument(companyA.id, { clientId: smithA.id, status: DocumentStatus.SENT }),
      otherCompany: await makeDocument(companyB.id, { clientId: jonesB.id, status: DocumentStatus.SENT }),
    };
  });

  afterAll(cleanup);

  async function linkedCustomer() {
    const customer = await makeCustomer();
    const { code } = await issueClientPortalCode(companyA.id, jonesA.id);
    await redeemClientPortalCode(customer.id, code);
    return customer;
  }

  it("shows a linked customer only the sent/paid documents of their own client record", async () => {
    const customer = await linkedCustomer();
    const ids = (await listCustomerInvoices(customer.id)).map((i) => i.id).sort();
    expect(ids).toEqual([docs.sent.id, docs.paid.id, docs.estimate.id].sort());

    for (const forbidden of [docs.draft, docs.otherClient, docs.otherCompany]) {
      expect(await getCustomerInvoice(customer.id, forbidden.id)).toBeNull();
    }
    expect(await getCustomerInvoice(customer.id, docs.sent.id)).not.toBeNull();
  });

  it("does not grant access just because the customer's email matches the client's", async () => {
    const impostor = await makeCustomer(`jones-${RUN}@example.com`);
    expect(await listCustomerInvoices(impostor.id)).toEqual([]);
    expect(await getCustomerInvoice(impostor.id, docs.sent.id)).toBeNull();
  });

  it("never exposes internal fields like job notes to customers", async () => {
    await prisma.document.update({ where: { id: docs.sent.id }, data: { notesText: "gate code 1234" } });
    const customer = await linkedCustomer();
    const invoice = await getCustomerInvoice(customer.id, docs.sent.id);
    expect(JSON.stringify(invoice)).not.toContain("gate code 1234");
    expect(invoice).not.toHaveProperty("notesText");
    expect(invoice).not.toHaveProperty("stripeCheckoutSessionId");
  });

  it("only lists payments for the customer's own invoices", async () => {
    const linked = await linkedCustomer();
    const outsider = await makeCustomer();
    await prisma.payment.create({
      data: {
        documentId: docs.paid.id,
        stripeCheckoutSessionId: `cs_test_${RUN}_history`,
        amount: 15000,
        currency: "usd",
        outcome: PaymentOutcome.APPLIED,
      },
    });
    expect((await listCustomerPayments(linked.id)).map((p) => p.documentId)).toContain(docs.paid.id);
    expect(await listCustomerPayments(outsider.id)).toEqual([]);
  });

  it("revokes access when the owner unlinks the customer", async () => {
    const customer = await linkedCustomer();
    await unlinkCustomerFromClient(companyA.id, jonesA.id, customer.id);
    expect(await listCustomerInvoices(customer.id)).toEqual([]);
  });

  describe("portal codes", () => {
    it("are single-use", async () => {
      const first = await makeCustomer();
      const second = await makeCustomer();
      const { code } = await issueClientPortalCode(companyA.id, jonesA.id);
      await redeemClientPortalCode(first.id, code);
      await expect(redeemClientPortalCode(second.id, code)).rejects.toThrow(/isn't valid/);
      expect(await listCustomerInvoices(second.id)).toEqual([]);
    });

    it("reject expired, malformed, and replaced codes", async () => {
      const customer = await makeCustomer();
      const { code: old } = await issueClientPortalCode(companyA.id, jonesA.id);
      const { code: fresh } = await issueClientPortalCode(companyA.id, jonesA.id);
      await expect(redeemClientPortalCode(customer.id, old)).rejects.toThrow(/isn't valid/);
      await expect(redeemClientPortalCode(customer.id, "NOPE")).rejects.toThrow(/isn't valid/);

      await prisma.client.update({ where: { id: jonesA.id }, data: { portalCodeExpiresAt: new Date(Date.now() - 1000) } });
      await expect(redeemClientPortalCode(customer.id, fresh)).rejects.toThrow(/isn't valid/);
    });

    it("accept the code in a forgiving format", async () => {
      const customer = await makeCustomer();
      const { code } = await issueClientPortalCode(companyA.id, jonesA.id);
      await redeemClientPortalCode(customer.id, `  ${code.toLowerCase().replace(/-/g, " ")} `);
      expect((await listCustomerInvoices(customer.id)).length).toBeGreaterThan(0);
    });

    it("can only be issued by the client's own company", async () => {
      await expect(issueClientPortalCode(companyB.id, jonesA.id)).rejects.toThrow(/not found/);
    });
  });

  describe("customer registration", () => {
    it("creates no company and no business user", async () => {
      const email = `newcustomer-${RUN}@example.com`;
      const companiesBefore = await prisma.company.count();
      await makeCustomer(email);
      expect(await prisma.company.count()).toBe(companiesBefore);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });
  });

  describe("server-side session guards", () => {
    beforeEach(() => authMock.mockReset());

    it("reject customer sessions from every business guard", async () => {
      const customer = await makeCustomer();
      authMock.mockResolvedValue({ user: { id: customer.id, role: "CUSTOMER", companyId: null } });
      await expect(requireSession()).rejects.toThrow();
      await expect(requireOwner()).rejects.toThrow();
      await expect(requireCustomer()).resolves.toMatchObject({ customerId: customer.id });
    });

    it("reject a customer session that smuggles in a companyId", async () => {
      authMock.mockResolvedValue({ user: { id: "x", role: "CUSTOMER", companyId: companyA.id } });
      await expect(requireSession()).rejects.toThrow();
    });

    it("reject business sessions from the customer guard", async () => {
      authMock.mockResolvedValue({ user: { id: "u", role: "OWNER", companyId: companyA.id } });
      await expect(requireCustomer()).rejects.toThrow();
      await expect(requireOwner()).resolves.toBe(companyA.id);
    });

    it("reject a customer whose account no longer exists", async () => {
      authMock.mockResolvedValue({ user: { id: "deleted-customer", role: "CUSTOMER", companyId: null } });
      await expect(requireCustomer()).rejects.toThrow();
    });
  });
});
