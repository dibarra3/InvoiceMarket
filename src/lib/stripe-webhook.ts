import type Stripe from "stripe";
import { prisma } from "./prisma";
import { amountInCents } from "./checkout";
import { DocumentStatus, DocumentType, PaymentOutcome } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type WebhookOutcome = "applied" | "needs_review" | "duplicate" | "ignored";
export type WebhookResult = { outcome: WebhookOutcome; reason?: string };

type DocumentWithItems = Prisma.DocumentGetPayload<{ include: { lineItems: true } }>;

/** Handles an already signature-verified Stripe event. Only a completed, paid, test-mode
 * Checkout Session that matches the invoice's current session, amount, and currency marks it
 * PAID; anything else that collected money is recorded as NEEDS_REVIEW. */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookResult> {
  if (event.livemode) return { outcome: "ignored", reason: "Live-mode events are ignored in this demo." };
  if (event.type !== "checkout.session.completed") return { outcome: "ignored", reason: `Unhandled ${event.type}` };

  const session = event.data.object;
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid") {
    return { outcome: "ignored", reason: "Session is not a completed, paid payment." };
  }
  return recordCompletedSession(session);
}

function verifyAgainstDocument(
  session: Stripe.Checkout.Session,
  doc: DocumentWithItems | null,
  amount: number,
  currency: string
): string | null {
  if (!doc) return "No matching invoice for this Checkout Session.";
  if (session.metadata?.companyId !== doc.companyId) return "Session metadata doesn't match the invoice's company.";
  if (doc.type !== DocumentType.INVOICE) return "Document is not an invoice.";
  if (doc.status === DocumentStatus.PAID) {
    return "Invoice was already paid — this is a duplicate payment and should be refunded.";
  }
  if (doc.status !== DocumentStatus.SENT) return "Invoice isn't in a payable state.";
  if (doc.stripeCheckoutSessionId !== session.id) {
    return "Checkout Session is no longer the invoice's active payment link.";
  }
  if (currency !== "usd") return `Unexpected currency "${currency}".`;
  const expected = amountInCents(doc.lineItems, doc.discountPercent, doc.taxRate);
  if (amount !== expected || amount !== doc.stripeCheckoutAmount) {
    return `Paid amount ${amount}¢ doesn't match the invoice total ${expected}¢.`;
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}

async function recordCompletedSession(session: Stripe.Checkout.Session): Promise<WebhookResult> {
  const documentId = session.metadata?.documentId ?? null;
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? "").toLowerCase();
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  try {
    return await prisma.$transaction(async (tx) => {
      // Duplicate delivery of an event we've already recorded: nothing to do.
      const prior = await tx.payment.findUnique({ where: { stripeCheckoutSessionId: session.id } });
      if (prior) return { outcome: "duplicate" as const };

      const doc = documentId
        ? await tx.document.findUnique({ where: { id: documentId }, include: { lineItems: true } })
        : null;
      const problem = verifyAgainstDocument(session, doc, amount, currency);

      const payment = await tx.payment.create({
        data: {
          documentId: doc?.id ?? null,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          amount,
          currency,
          outcome: problem ? PaymentOutcome.NEEDS_REVIEW : PaymentOutcome.APPLIED,
          note: problem ?? "",
          livemode: session.livemode,
        },
      });
      if (problem) return { outcome: "needs_review" as const, reason: problem };

      const { count } = await tx.document.updateMany({
        where: { id: doc!.id, status: DocumentStatus.SENT, stripeCheckoutSessionId: session.id },
        data: { status: DocumentStatus.PAID, paidAt: new Date() },
      });
      if (count === 0) {
        const reason = "Invoice changed before the payment could be applied.";
        await tx.payment.update({
          where: { id: payment.id },
          data: { outcome: PaymentOutcome.NEEDS_REVIEW, note: reason },
        });
        return { outcome: "needs_review" as const, reason };
      }
      return { outcome: "applied" as const };
    });
  } catch (err) {
    // Two deliveries of the same event racing: the unique session id lets exactly one win.
    if (isUniqueViolation(err)) return { outcome: "duplicate" };
    throw err;
  }
}
