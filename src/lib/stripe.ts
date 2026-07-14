import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazily constructs the Stripe client so pages that never touch payments can render
 * even when STRIPE_SECRET_KEY isn't configured yet. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your .env to enable invoice payment links."
    );
  }
  client = new Stripe(key);
  return client;
}
