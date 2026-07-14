"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { prisma } from "./prisma";
import { requireOwner } from "./session";
import { getStripe } from "./stripe";
import { computeTotals } from "./totals";
import { getDocument } from "./actions";

async function resolveOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Creates (or reuses) a Stripe Checkout Session for this invoice's current total and
 * returns a hosted payment link. Estimates can't be paid — only invoices. Owner-only: Field
 * Crew accounts don't get access to billing/Stripe. */
export async function createPaymentLink(documentId: string): Promise<string> {
  const companyId = await requireOwner();
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  if (doc.type !== "INVOICE") throw new Error("Only invoices can be paid online.");

  const totals = computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate);
  if (totals.total <= 0) throw new Error("Add line items before creating a payment link.");

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const origin = await resolveOrigin();
  const stripe = getStripe();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(totals.total * 100),
            product_data: {
              name: `${doc.docNumber} — ${company.name || "Invoice"}`,
              description: doc.clientName ? `Billed to ${doc.clientName}` : undefined,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { documentId },
      success_url: `${origin}/editor/${documentId}?paid=1`,
      cancel_url: `${origin}/editor/${documentId}`,
    });
  } catch (err) {
    console.error("Stripe checkout session creation failed", err);
    const detail = err instanceof Stripe.errors.StripeError ? err.message : undefined;
    throw new Error(
      detail
        ? `Stripe couldn't create a payment link: ${detail}`
        : "Stripe couldn't create a payment link. Check your Stripe configuration and try again."
    );
  }

  if (!session.url) throw new Error("Stripe did not return a payment URL. Try again in a moment.");

  await prisma.document.update({
    where: { id: documentId },
    data: {
      stripeCheckoutSessionId: session.id,
      stripePaymentLinkUrl: session.url,
    },
  });

  revalidatePath(`/editor/${documentId}`);
  return session.url;
}
