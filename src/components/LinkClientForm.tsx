"use client";

import { useActionState } from "react";
import { redeemPortalCodeAction } from "@/lib/customer-actions";

export function LinkClientForm() {
  const [state, formAction, isPending] = useActionState(redeemPortalCodeAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="code"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="Portal code, e.g. 7K2M-9QXD-4HTR"
          className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 font-mono text-sm uppercase text-slate-100 outline-none placeholder:normal-case placeholder:text-slate-600 focus:border-emerald-500/60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex-shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink disabled:opacity-70"
        >
          {isPending ? "Linking…" : "Link"}
        </button>
      </div>
      {state && (
        <p className={`font-mono text-xs ${state.ok ? "text-emerald-400" : "text-amber-400"}`}>{state.message}</p>
      )}
    </form>
  );
}
