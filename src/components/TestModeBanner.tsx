/** Shown anywhere a payment can start: this deployment only ever uses Stripe Sandbox. */
export function TestModeBanner() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
      <p className="font-bold uppercase tracking-wide text-amber-300">Test mode · Stripe Sandbox</p>
      <p className="mt-0.5 text-amber-200/80">
        No real money moves. Pay with card <span className="font-mono">4242 4242 4242 4242</span>, any future
        expiry date, and any CVC.
      </p>
    </div>
  );
}
