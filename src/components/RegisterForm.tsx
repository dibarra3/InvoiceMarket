"use client";

import { useActionState } from "react";
import { registerCompany } from "@/lib/auth-actions";

async function submit(_prevState: string | null, formData: FormData): Promise<string | null> {
  try {
    await registerCompany(formData);
    return null;
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // NEXT_REDIRECT
    return err instanceof Error ? err.message : "Something went wrong.";
  }
}

export function RegisterForm() {
  const [error, formAction, isPending] = useActionState(submit, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-card p-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      <label className="block">
        <span className="block text-xs text-slate-500">Company Name</span>
        <input
          type="text"
          name="companyName"
          required
          placeholder="e.g. Cascade Grounds & Excavation"
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-500">Email</span>
        <input
          type="email"
          name="email"
          required
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-500">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
        />
        <span className="mt-1 block text-[11px] text-slate-600">At least 8 characters.</span>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
