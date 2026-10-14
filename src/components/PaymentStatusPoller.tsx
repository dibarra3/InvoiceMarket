"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

/** Re-renders the (server) success page every few seconds until the webhook has marked the
 * invoice paid. It only re-reads status — it never marks anything paid itself. */
export function PaymentStatusPoller() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return;
    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, router]);

  return attempts >= MAX_ATTEMPTS ? (
    <p className="text-xs text-slate-500">
      Still waiting on Stripe&apos;s confirmation. Refresh this page in a minute — you won&apos;t be charged twice.
    </p>
  ) : (
    <p className="flex items-center gap-2 text-xs text-slate-500">
      <span className="h-3 w-3 animate-spin-fast rounded-full border-2 border-slate-600 border-t-emerald-400" />
      Checking for confirmation…
    </p>
  );
}
