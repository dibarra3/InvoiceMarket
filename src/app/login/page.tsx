import Link from "next/link";
import { loginWithCredentials } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">Sign in</h1>
      <p className="mb-6 text-sm text-slate-500">Access your company&apos;s invoices and estimates.</p>

      <form action={loginWithCredentials} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-card p-5">
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            Invalid email or password.
          </p>
        )}
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
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink"
        >
          Sign in
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        No account yet?{" "}
        <Link href="/register" className="text-emerald-400 underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
