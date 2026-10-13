"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/errors";

/** Asks the server for a Checkout URL (the server computes the amount) and redirects to Stripe. */
export function PayInvoiceButton({
  action,
  label,
}: {
  action: () => Promise<ActionResult<{ url: string }>>;
  label: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        window.location.assign(result.url);
        return; // keep the spinner while the browser navigates to Stripe
      }
      setError(result.error);
    } catch {
      setError("Couldn't start checkout. Please try again.");
    }
    setPending(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-ink shadow-[0_10px_25px_-10px_rgba(16,185,129,0.4)] hover:bg-emerald-400 disabled:opacity-70"
      >
        {pending && <span className="h-4 w-4 animate-spin-fast rounded-full border-2 border-ink/30 border-t-ink" />}
        {pending ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="mt-2 font-mono text-xs text-amber-400">{error}</p>}
    </div>
  );
}
