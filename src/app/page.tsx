import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeForRole } from "@/lib/routes";

/** Public front door: guests pay, customers sign in, businesses use the small link up top.
 * Signed-in users go straight to their own area. */
export default async function Home() {
  const home = homeForRole((await auth())?.user?.role);
  if (home) redirect(home);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-14 sm:py-20">
      <section className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-emerald-400">Landscaping & excavation billing</p>
        <h2 className="mt-3 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
          Got an invoice from your contractor? Pay it in a minute.
        </h2>
        <p className="mt-4 text-base text-slate-400">
          Groundwork turns crews&apos; messy job notes into clean invoices — and gives their customers one simple
          place to view and pay them.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/pay"
            className="flex items-center justify-center rounded-xl bg-emerald-500 px-7 py-4 text-base font-bold text-ink shadow-[0_10px_25px_-10px_rgba(16,185,129,0.5)] hover:bg-emerald-400"
          >
            Pay an invoice
          </Link>
          <Link
            href="/customer/login"
            className="flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-4 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Customer sign in
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          No account needed to pay — just your invoice number and access code. Want all your invoices in one place?{" "}
          <Link href="/customer/register" className="text-emerald-400 underline">
            Create a customer account
          </Link>
          .
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Pay as a guest",
            body: "Enter the invoice number and access code from your email, review the invoice, and pay by card.",
          },
          {
            title: "Customer accounts",
            body: "Link your account with the one-time code from your contractor to see every invoice and payment.",
          },
          {
            title: "For businesses",
            body: "Dictate job notes, let Magic Parse build the invoice, then send it with a private payment link.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-white/10 bg-card p-5">
            <h3 className="font-display text-base font-semibold text-white">{f.title}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>

      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        <span className="font-bold uppercase tracking-wide text-amber-300">Portfolio demo · test mode.</span> All
        payments run in Stripe Sandbox. Use card 4242 4242 4242 4242 — no real money moves.
      </p>
    </main>
  );
}
