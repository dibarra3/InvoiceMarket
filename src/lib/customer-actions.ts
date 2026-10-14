"use server";

import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { requireCustomer } from "./session";
import { getCustomerInvoice, redeemClientPortalCode, registerCustomer } from "./customer-portal";
import { getOrCreateCheckoutSession } from "./checkout";
import { resolveOrigin } from "./origin";
import { actionError, type ActionResult } from "./errors";
import { CUSTOMER_HOME } from "./routes";

/** Creates a Customer row only — never a Company or business User — then signs in. */
export async function registerCustomerAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await registerCustomer({ name: String(formData.get("name") ?? ""), email, password });
  } catch (err) {
    return actionError(err, "Couldn't create your account.").error;
  }
  // signIn redirects by throwing, so it must stay outside the try/catch above.
  await signIn("customer-credentials", { email, password, redirectTo: CUSTOMER_HOME });
  return null;
}

export async function loginCustomerAction(_prev: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn("customer-credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: CUSTOMER_HOME,
    });
    return null;
  } catch (err) {
    if (err instanceof AuthError) return "Invalid email or password.";
    throw err; // NEXT_REDIRECT on success
  }
}

export async function signOutCustomerAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export type RedeemState = { ok: boolean; message: string } | null;

export async function redeemPortalCodeAction(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  try {
    const { customerId } = await requireCustomer();
    const { clientName, companyName } = await redeemClientPortalCode(customerId, String(formData.get("code") ?? ""));
    revalidatePath(CUSTOMER_HOME);
    return { ok: true, message: `Linked to ${clientName} at ${companyName || "your contractor"}.` };
  } catch (err) {
    return { ok: false, message: actionError(err, "Couldn't link your account.").error };
  }
}

/** Starts Stripe Checkout for an invoice the signed-in customer is authorized to see. */
export async function startCustomerCheckout(documentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { customerId } = await requireCustomer();
    const invoice = await getCustomerInvoice(customerId, documentId);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    const url = await getOrCreateCheckoutSession(invoice.id, { audience: "customer", origin: await resolveOrigin() });
    return { ok: true, url };
  } catch (err) {
    return actionError(err, "Couldn't start checkout.");
  }
}
