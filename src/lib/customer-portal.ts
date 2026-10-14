import bcrypt from "bcryptjs";
import { UserFacingError } from "./errors";
import { prisma } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CODE_LENGTH, formatCode, generateCode, hashCode, normalizeCode } from "./access-codes";
import { CLIENT_VISIBLE_STATUSES, publicDocumentInclude, toPublicInvoice, type PublicInvoice } from "./public-invoice";

export const PORTAL_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PortalError extends UserFacingError {}

// ---------- Customer accounts ----------

/** Creates a customer login. Touches only the `Customer` table — never a Company or a
 * business `User`, so signup can't grant any business permissions. */
export async function registerCustomer(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new PortalError("Enter a valid email address.");
  if (input.password.length < 8) throw new PortalError("Password must be at least 8 characters.");

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) throw new PortalError("A customer account with that email already exists.");

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.customer.create({ data: { name, email, passwordHash } });
}

export async function verifyCustomerCredentials(email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!customer) return null;
  const valid = await bcrypt.compare(password, customer.passwordHash);
  return valid ? customer : null;
}

// ---------- What a customer can see ----------

/** The single source of truth for customer authorization: sent/paid documents whose client
 * record the customer has been linked to via an owner-issued code. Email is never consulted. */
export function customerDocumentWhere(customerId: string): Prisma.DocumentWhereInput {
  return {
    status: { in: CLIENT_VISIBLE_STATUSES },
    client: { customerLinks: { some: { customerId } } },
  };
}

export async function listCustomerInvoices(customerId: string): Promise<PublicInvoice[]> {
  const docs = await prisma.document.findMany({
    where: customerDocumentWhere(customerId),
    orderBy: { date: "desc" },
    include: publicDocumentInclude,
  });
  return docs.map(toPublicInvoice);
}

export async function getCustomerInvoice(customerId: string, documentId: string): Promise<PublicInvoice | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, ...customerDocumentWhere(customerId) },
    include: publicDocumentInclude,
  });
  return doc ? toPublicInvoice(doc) : null;
}

export type CustomerPaymentRecord = {
  id: string;
  documentId: string;
  docNumber: string;
  companyName: string;
  amountCents: number;
  currency: string;
  outcome: "APPLIED" | "NEEDS_REVIEW";
  createdAt: string;
};

export async function listCustomerPayments(customerId: string): Promise<CustomerPaymentRecord[]> {
  const payments = await prisma.payment.findMany({
    where: { document: customerDocumentWhere(customerId) },
    orderBy: { createdAt: "desc" },
    include: { document: { select: { id: true, docNumber: true, company: { select: { name: true } } } } },
  });
  return payments.flatMap((p) =>
    p.document
      ? [
          {
            id: p.id,
            documentId: p.document.id,
            docNumber: p.document.docNumber,
            companyName: p.document.company.name,
            amountCents: p.amount,
            currency: p.currency,
            outcome: p.outcome,
            createdAt: p.createdAt.toISOString(),
          },
        ]
      : []
  );
}

export async function listCustomerLinks(customerId: string) {
  const links = await prisma.customerClientLink.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
    include: { client: { select: { name: true, company: { select: { name: true } } } } },
  });
  return links.map((l) => ({ id: l.id, clientName: l.client.name, companyName: l.client.company.name }));
}

// ---------- Owner-issued portal codes ----------

/** Issues a single-use code that links whichever customer redeems it to this client record.
 * Replaces any outstanding code. Only the hash is stored, so the code is shown exactly once. */
export async function issueClientPortalCode(companyId: string, clientId: string) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + PORTAL_CODE_TTL_MS);
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, companyId },
    data: { portalCodeHash: hashCode(code), portalCodeExpiresAt: expiresAt },
  });
  if (count === 0) throw new PortalError("Client not found.");
  return { code: formatCode(code), expiresAt };
}

export async function redeemClientPortalCode(customerId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) throw new PortalError("That code isn't valid or has expired.");
  const codeHash = hashCode(code);

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { portalCodeHash: codeHash },
      include: { company: { select: { name: true } } },
    });
    if (!client || !client.portalCodeExpiresAt || client.portalCodeExpiresAt <= new Date()) {
      throw new PortalError("That code isn't valid or has expired.");
    }

    // Burn the code first (compare-and-set) so it can only ever be redeemed once.
    const { count } = await tx.client.updateMany({
      where: { id: client.id, portalCodeHash: codeHash },
      data: { portalCodeHash: null, portalCodeExpiresAt: null },
    });
    if (count === 0) throw new PortalError("That code isn't valid or has expired.");

    await tx.customerClientLink.upsert({
      where: { customerId_clientId: { customerId, clientId: client.id } },
      update: {},
      create: { customerId, clientId: client.id },
    });
    return { clientName: client.name, companyName: client.company.name };
  });
}

export async function unlinkCustomerFromClient(companyId: string, clientId: string, customerId: string) {
  await prisma.customerClientLink.deleteMany({
    where: { customerId, clientId, client: { companyId } },
  });
}

export type ClientPortalAccess = {
  clientId: string;
  pendingCodeExpiresAt: string | null;
  customers: { id: string; email: string; name: string }[];
};

export async function listPortalAccessForCompany(companyId: string): Promise<Record<string, ClientPortalAccess>> {
  const clients = await prisma.client.findMany({
    where: { companyId },
    select: {
      id: true,
      portalCodeExpiresAt: true,
      customerLinks: {
        orderBy: { createdAt: "asc" },
        select: { customer: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  const now = new Date();
  return Object.fromEntries(
    clients.map((c) => [
      c.id,
      {
        clientId: c.id,
        pendingCodeExpiresAt:
          c.portalCodeExpiresAt && c.portalCodeExpiresAt > now ? c.portalCodeExpiresAt.toISOString() : null,
        customers: c.customerLinks.map((l) => l.customer),
      },
    ])
  );
}
