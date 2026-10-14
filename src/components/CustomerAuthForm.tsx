"use client";

import { useActionState } from "react";
import { loginCustomerAction, registerCustomerAction } from "@/lib/customer-actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60";

export function CustomerAuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, formAction, isPending] = useActionState(
    mode === "login" ? loginCustomerAction : registerCustomerAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-card p-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      {mode === "register" && (
        <label className="block">
          <span className="block text-xs text-slate-500">Your name</span>
          <input type="text" name="name" autoComplete="name" className={inputClass} />
        </label>
      )}
      <label className="block">
        <span className="block text-xs text-slate-500">Email</span>
        <input type="email" name="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-500">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          className={inputClass}
        />
        {mode === "register" && <span className="mt-1 block text-[11px] text-slate-600">At least 8 characters.</span>}
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
      >
        {isPending
          ? mode === "login"
            ? "Signing in…"
            : "Creating account…"
          : mode === "login"
            ? "Sign in"
            : "Create customer account"}
      </button>
    </form>
  );
}
