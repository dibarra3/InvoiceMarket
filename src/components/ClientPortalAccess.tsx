"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientPortalCode, unlinkPortalCustomer } from "@/lib/access-actions";
import { formatDateDisplay } from "@/lib/format";
import type { ClientPortalAccess as Access } from "@/lib/customer-portal";

/** Owner-only: issue a one-time portal code for this client and manage linked customers. */
export function ClientPortalAccess({ clientId, access }: { clientId: string; access: Access | undefined }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleIssue() {
    if (access?.pendingCodeExpiresAt && !confirm("Replace the outstanding portal code? The old one will stop working.")) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await createClientPortalCode(clientId).catch(() => null);
    if (result?.ok) {
      setIssued({ code: result.code, expiresAt: result.expiresAt });
      startTransition(() => router.refresh());
    } else {
      setError(result?.error ?? "Couldn't create a portal code.");
    }
    setPending(false);
  }

  async function handleUnlink(customerId: string, email: string) {
    if (!confirm(`Remove ${email}'s access to this client's invoices?`)) return;
    const result = await unlinkPortalCustomer(clientId, customerId).catch(() => null);
    if (result?.ok) startTransition(() => router.refresh());
    else setError(result?.error ?? "Couldn't remove access.");
  }

  const customers = access?.customers ?? [];

  return (
    <div className="mt-3 border-t border-white/[0.08] pt-3 text-xs">
      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Customer portal</div>
      {customers.length === 0 ? (
        <p className="text-slate-500">No customer accounts linked.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-slate-300">{c.email}</span>
              <button
                type="button"
                onClick={() => handleUnlink(c.id, c.email)}
                className="flex-shrink-0 font-semibold text-slate-500 hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {issued ? (
        <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold text-emerald-300">{issued.code}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(issued.code)}
              className="font-semibold text-emerald-400"
            >
              Copy
            </button>
          </div>
          <p className="mt-1 text-[11px] text-emerald-300/80">
            Shown once. Single-use, expires {formatDateDisplay(issued.expiresAt)}. Give it to the client; they enter it
            under My invoices after creating a customer account.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleIssue}
          disabled={pending}
          className="mt-2 font-semibold text-emerald-400 disabled:opacity-60"
        >
          {pending
            ? "Creating…"
            : access?.pendingCodeExpiresAt
              ? `Replace portal code (current one expires ${formatDateDisplay(access.pendingCodeExpiresAt)})`
              : "Create portal code"}
        </button>
      )}
      {error && <p className="mt-1.5 text-amber-400">{error}</p>}
    </div>
  );
}
