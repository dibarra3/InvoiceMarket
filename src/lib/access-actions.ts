"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireOwner } from "./session";
import { ensureGuestAccess, rotateGuestAccess } from "./guest-access";
import { invalidateCheckout } from "./checkout";
import { issueClientPortalCode, unlinkCustomerFromClient } from "./customer-portal";
import { resolveOrigin } from "./origin";
import { UserFacingError, actionError, type ActionResult } from "./errors";

export type InvoiceAccessDetails = {
  link: string;
  code: string;
  payPageUrl: string;
  clientName: string | null;
  portalCustomers: string[];
};

async function describeAccess(companyId: string, documentId: string, token: string, code: string) {
  const origin = await resolveOrigin();
  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, companyId },
    select: {
      client: {
        select: { name: true, customerLinks: { select: { customer: { select: { email: true } } } } },
      },
    },
  });
  return {
    link: `${origin}/invoice/${token}`,
    code,
    payPageUrl: `${origin}/pay`,
    clientName: doc.client?.name ?? null,
    portalCustomers: doc.client?.customerLinks.map((l) => l.customer.email) ?? [],
  };
}

/** Owner-only: the guest link + access code for a document (generated on first request), and
 * which customer-portal accounts can see it through its client record. */
export async function getInvoiceAccess(documentId: string): Promise<ActionResult<{ access: InvoiceAccessDetails }>> {
  try {
    const companyId = await requireOwner();
    const { token, code } = await ensureGuestAccess(companyId, documentId);
    return { ok: true, access: await describeAccess(companyId, documentId, token, code) };
  } catch (err) {
    return actionError(err, "Couldn't load access details.");
  }
}

/** Owner-only: replaces the guest link + code. Old links stop working, and any open Checkout
 * Session (whose return URL embeds the old link) is expired. */
export async function rotateInvoiceAccess(documentId: string): Promise<ActionResult<{ access: InvoiceAccessDetails }>> {
  try {
    const companyId = await requireOwner();
    // The open Checkout Session's return URL embeds the old link, so cancel it first; if that
    // can't be confirmed, keep the current link and code rather than half-rotating.
    const owned = await prisma.document.findFirst({ where: { id: documentId, companyId }, select: { id: true } });
    if (!owned) throw new UserFacingError("Document not found.");
    await invalidateCheckout(documentId);
    const { token, code } = await rotateGuestAccess(companyId, documentId);
    revalidatePath(`/editor/${documentId}`);
    return { ok: true, access: await describeAccess(companyId, documentId, token, code) };
  } catch (err) {
    return actionError(err, "Couldn't reset access details.");
  }
}

/** Owner-only: a one-time code the owner gives to the real client, out of band, so they can
 * link their customer account to this client record. */
export async function createClientPortalCode(
  clientId: string
): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  try {
    const companyId = await requireOwner();
    const { code, expiresAt } = await issueClientPortalCode(companyId, clientId);
    revalidatePath("/clients");
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    return actionError(err, "Couldn't create a portal code.");
  }
}

export async function unlinkPortalCustomer(clientId: string, customerId: string): Promise<ActionResult> {
  try {
    const companyId = await requireOwner();
    await unlinkCustomerFromClient(companyId, clientId, customerId);
    revalidatePath("/clients");
    return { ok: true };
  } catch (err) {
    return actionError(err, "Couldn't remove portal access.");
  }
}
