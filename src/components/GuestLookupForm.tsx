"use client";

import { useActionState } from "react";
import { lookupGuestInvoiceAction } from "@/lib/guest-actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2.5 font-mono text-sm uppercase text-slate-100 outline-none placeholder:normal-case placeholder:text-slate-600 focus:border-emerald-500/60";

export function GuestLookupForm() {
  const [error, formAction, isPending] = useActionState(lookupGuestInvoiceAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-card p-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      <label className="block">
        <span className="block text-xs text-slate-500">Invoice number</span>
        <input name="docNumber" required autoComplete="off" placeholder="e.g. INV-1042" className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-500">Access code</span>
        <input
          name="code"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 7K2M-9QXD-4HTR"
          className={inputClass}
        />
        <span className="mt-1 block text-[11px] text-slate-600">
          Printed on the invoice email from your contractor.
        </span>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
      >
        {isPending ? "Looking up…" : "Find my invoice"}
      </button>
    </form>
  );
}
