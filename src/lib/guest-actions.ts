"use server";

import { redirect } from "next/navigation";
import { findGuestInvoiceByToken, findGuestTokenByCode } from "./guest-access";
import { getOrCreateCheckoutSession } from "./checkout";
import { resolveOrigin } from "./origin";
import { actionError, type ActionResult } from "./errors";

/** /pay form: invoice number + access code → the invoice's guest page. One generic error for
 * every failure so the form can't be used to probe which invoice numbers exist. */
export async function lookupGuestInvoiceAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const token = await findGuestTokenByCode(
    String(formData.get("docNumber") ?? ""),
    String(formData.get("code") ?? "")
  );
  if (!token) return "We couldn't find an invoice with that number and access code.";
  redirect(`/invoice/${token}`);
}

/** Starts Stripe Checkout for whoever holds the invoice's unguessable link. */
export async function startGuestCheckout(token: string): Promise<ActionResult<{ url: string }>> {
  try {
    const invoice = await findGuestInvoiceByToken(token);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    const url = await getOrCreateCheckoutSession(invoice.id, { audience: "guest", origin: await resolveOrigin() });
    return { ok: true, url };
  } catch (err) {
    return actionError(err, "Couldn't start checkout.");
  }
}
