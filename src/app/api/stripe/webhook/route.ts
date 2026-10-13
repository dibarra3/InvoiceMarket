import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripe-webhook";

/** Stripe → Groundwork. The signature check is the only thing that makes an event trusted;
 * Checkout's success redirect never marks anything paid. */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    if (result.outcome === "needs_review") {
      console.warn(`Stripe payment needs review (${event.id}): ${result.reason}`);
    }
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // Database trouble — a 500 makes Stripe retry later, and retries are idempotent.
    console.error("Failed to process Stripe webhook", event.id, err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
