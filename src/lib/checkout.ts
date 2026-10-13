import type Stripe from "stripe";
import { prisma } from "./prisma";
import { getStripe } from "./stripe";
import { computeTotals, type TotalsInput } from "./totals";
import { ensureGuestAccess } from "./guest-access";
import { UserFacingError } from "./errors";
import { DocumentStatus, DocumentType, PaymentOutcome } from "@/generated/prisma/enums";

/** Stripe's minimum charge for USD, and its maximum for a single card payment. */
export const USD_MIN_CENTS = 50;
export const USD_MAX_CENTS = 99_999_999;

export const TEST_MODE_DESCRIPTION = "TEST MODE — Stripe Sandbox payment. No real money moves.";

/** Expected, user-facing failures (already paid, below minimum, …) — safe to show as-is. */
export class CheckoutError extends UserFacingError {}

/** Server-side source of truth for what an invoice costs, in USD cents. Never trust a
 * client-supplied amount. */
export function amountInCents(items: TotalsInput, discountPercent: number, taxRate: number): number {
  return Math.round(computeTotals(items, discountPercent, taxRate).total * 100);
}

/** Who will land on the success/cancel pages: guests return to their unguessable invoice
 * link, signed-in customers to their portal. */
export type CheckoutAudience = "guest" | "customer";

/** Stripe couldn't confirm a session's state (network error, outage, rate limit, auth
 * problem…). Nothing was changed; the caller should retry later. */
export class CheckoutUnavailableError extends CheckoutError {}

const UNCONFIRMED_MESSAGE =
  "Couldn't confirm this invoice's current payment link with Stripe, so nothing was changed. Please try again in a moment.";
const COMPLETED_MESSAGE = "A payment for this invoice was just completed — it'll show as paid in a moment.";

/** What we know *for certain* about a stored Checkout Session. */
type SessionState =
  | { kind: "open"; session: Stripe.Checkout.Session }
  | { kind: "complete" }
  | { kind: "expired" }
  | { kind: "missing" }; // Stripe says the session doesn't exist

/** Only Stripe's explicit "no such resource" answer proves a session is gone. */
function isResourceMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "resource_missing";
}

async function getSessionState(stripe: Stripe, id: string): Promise<SessionState> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(id);
  } catch (err) {
    if (isResourceMissing(err)) return { kind: "missing" };
    console.error("Couldn't retrieve Checkout Session", id, err instanceof Error ? err.message : err);
    throw new CheckoutUnavailableError(UNCONFIRMED_MESSAGE);
  }
  if (session.status === "open") return { kind: "open", session };
  if (session.status === "complete") return { kind: "complete" };
  if (session.status === "expired") return { kind: "expired" };
  throw new CheckoutUnavailableError(UNCONFIRMED_MESSAGE);
}

/** Makes sure a session can no longer be paid. Returns only once Stripe confirms it's expired
 * (or doesn't exist); throws if it completed, or if its state can't be confirmed. */
async function retireSession(stripe: Stripe, id: string): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(id);
    return;
  } catch (err) {
    if (isResourceMissing(err)) return;
    // Fall through: expiring fails for sessions that already expired or completed, and on
    // transient errors — look at the session to tell which.
  }
  const state = await getSessionState(stripe, id);
  if (state.kind === "expired" || state.kind === "missing") return;
  if (state.kind === "complete") throw new CheckoutError(COMPLETED_MESSAGE);
  throw new CheckoutUnavailableError(UNCONFIRMED_MESSAGE); // still open
}

/** Returns a Stripe Checkout URL for a sent, unpaid invoice — reusing the current session when
 * it's still open for the same amount and return page, otherwise expiring it and creating a
 * new one. Callers must authorize access to `documentId` before calling this. */
export async function getOrCreateCheckoutSession(
  documentId: string,
  opts: { audience: CheckoutAudience; origin: string },
  stripe: Stripe = getStripe()
): Promise<string> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { lineItems: true, company: { select: { name: true } } },
  });
  if (!doc) throw new CheckoutError("Invoice not found.");
  if (doc.type !== DocumentType.INVOICE) throw new CheckoutError("Only invoices can be paid online.");
  if (doc.status === DocumentStatus.PAID) throw new CheckoutError("This invoice has already been paid.");
  if (doc.status !== DocumentStatus.SENT) {
    throw new CheckoutError("This invoice hasn't been sent yet, so it can't be paid online.");
  }
  const appliedPayments = await prisma.payment.count({ where: { documentId, outcome: PaymentOutcome.APPLIED } });
  if (appliedPayments > 0) throw new CheckoutError("This invoice has already been paid.");

  const amount = amountInCents(doc.lineItems, doc.discountPercent, doc.taxRate);
  if (!Number.isFinite(amount) || amount < USD_MIN_CENTS) {
    throw new CheckoutError("Online payments must be at least $0.50 (Stripe's USD minimum).");
  }
  if (amount > USD_MAX_CENTS) {
    throw new CheckoutError("This invoice is above Stripe's maximum for a single card payment.");
  }

  const returnBase =
    opts.audience === "guest"
      ? `/invoice/${(await ensureGuestAccess(doc.companyId, doc.id)).token}`
      : `/customer/invoices/${doc.id}`;

  // A replacement is only created once the current session is confirmed unpayable. If Stripe
  // can't tell us its state, getSessionState/retireSession throw and nothing changes.
  const previousId = doc.stripeCheckoutSessionId;
  if (previousId) {
    const previous = await getSessionState(stripe, previousId);
    if (previous.kind === "complete") throw new CheckoutError(COMPLETED_MESSAGE);
    if (previous.kind === "open") {
      const { session: open } = previous;
      const reusable =
        open.url &&
        open.amount_total === amount &&
        open.currency === "usd" &&
        doc.stripeCheckoutAmount === amount &&
        open.metadata?.returnBase === returnBase;
      if (reusable) return open.url!;
      await retireSession(stripe, previousId);
    }
    // "expired" / "missing": confirmed unpayable, safe to replace.
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: doc.id,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: {
              name: `${doc.docNumber} — ${doc.company.name || "Invoice"}`,
              description: TEST_MODE_DESCRIPTION,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { documentId: doc.id, companyId: doc.companyId, amountCents: String(amount), returnBase },
      payment_intent_data: { metadata: { documentId: doc.id, companyId: doc.companyId } },
      success_url: `${opts.origin}${returnBase}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${opts.origin}${returnBase}/payment/canceled`,
    });
  } catch (err) {
    console.error("Stripe checkout session creation failed", err);
    const detail = err instanceof Error && "type" in err ? err.message : undefined;
    throw new CheckoutError(
      detail
        ? `Stripe couldn't create a payment link: ${detail}`
        : "Stripe couldn't create a payment link. Check your Stripe configuration and try again."
    );
  }

  if (!session.url) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    throw new CheckoutError("Stripe did not return a payment URL. Try again in a moment.");
  }

  // Compare-and-set against the session we started from, so concurrent requests can't leave
  // two live sessions attached to one invoice. The loser expires its own session.
  const { count } = await prisma.document.updateMany({
    where: { id: doc.id, status: DocumentStatus.SENT, stripeCheckoutSessionId: previousId },
    data: { stripeCheckoutSessionId: session.id, stripePaymentLinkUrl: session.url, stripeCheckoutAmount: amount },
  });
  if (count === 0) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    throw new CheckoutError("This invoice changed while preparing checkout — please try again.");
  }

  return session.url;
}

/** Expires the document's current Checkout Session and forgets it — used before an owner moves
 * an invoice back to draft, marks it paid manually, resets its guest link, or deletes it, so an
 * old link can never be paid.
 *
 * Call it *before* the dependent change and let it throw: if Stripe can't confirm the session
 * is expired (or reports it completed), the session reference is kept and the caller must not
 * proceed. */
export async function invalidateCheckout(documentId: string, stripe?: Stripe): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { stripeCheckoutSessionId: true },
  });
  const sessionId = doc?.stripeCheckoutSessionId;
  if (!sessionId) return;

  let client: Stripe;
  try {
    client = stripe ?? getStripe();
  } catch {
    throw new CheckoutUnavailableError(
      "Stripe isn't configured, so this invoice's payment link can't be cancelled. Nothing was changed."
    );
  }
  await retireSession(client, sessionId);

  await prisma.document.updateMany({
    where: { id: documentId, stripeCheckoutSessionId: sessionId },
    data: { stripeCheckoutSessionId: null, stripePaymentLinkUrl: null, stripeCheckoutAmount: null },
  });
}
