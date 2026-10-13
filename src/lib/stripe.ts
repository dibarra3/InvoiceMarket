import Stripe from "stripe";

let client: Stripe | null = null;

/** This deployment is a portfolio demo: payments must stay in Stripe Sandbox (test mode). */
export function isStripeTestKey(key: string): boolean {
  return /^(sk|rk)_test_/.test(key);
}

/** Lazily constructs the Stripe client so pages that never touch payments can render
 * even when STRIPE_SECRET_KEY isn't configured yet. Refuses live-mode keys. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your .env to enable invoice payment links."
    );
  }
  if (!isStripeTestKey(key)) {
    throw new Error("Groundwork only runs Stripe in Sandbox (test mode). Use an sk_test_ key.");
  }
  client = new Stripe(key);
  return client;
}
