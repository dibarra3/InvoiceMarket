"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireOwner } from "./session";
import { CheckoutError, USD_MIN_CENTS, amountInCents, getOrCreateCheckoutSession } from "./checkout";
import { resolveOrigin } from "./origin";
import { actionError, type ActionResult } from "./errors";
import { DocumentStatus, DocumentType } from "@/generated/prisma/enums";

/** Owner-only: returns a Stripe Checkout link for this invoice (reusing the open one when it
 * still matches). A payment link is a request for payment, so a draft is marked SENT first —
 * which also locks its line items and totals so the charged amount can't drift. Payers
 * return to the invoice's guest page, not the editor. */
export async function createPaymentLink(documentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const companyId = await requireOwner();
    const doc = await prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: { lineItems: true },
    });
    if (!doc) throw new CheckoutError("Invoice not found.");
    if (doc.type !== DocumentType.INVOICE) throw new CheckoutError("Only invoices can be paid online.");
    if (doc.status === DocumentStatus.PAID) throw new CheckoutError("This invoice has already been paid.");
    if (amountInCents(doc.lineItems, doc.discountPercent, doc.taxRate) < USD_MIN_CENTS) {
      throw new CheckoutError("Online payments must be at least $0.50 (Stripe's USD minimum).");
    }

    if (doc.status === DocumentStatus.DRAFT) {
      await prisma.document.updateMany({
        where: { id: documentId, companyId, status: DocumentStatus.DRAFT },
        data: { status: DocumentStatus.SENT },
      });
    }

    const url = await getOrCreateCheckoutSession(documentId, { audience: "guest", origin: await resolveOrigin() });
    revalidatePath(`/editor/${documentId}`);
    revalidatePath("/invoices");
    return { ok: true, url };
  } catch (err) {
    return actionError(err, "Couldn't create a payment link.");
  }
}
