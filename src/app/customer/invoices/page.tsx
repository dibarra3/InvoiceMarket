import type { Metadata } from "next";
import Link from "next/link";
import { customerOrRedirect } from "@/lib/customer-page";
import { listCustomerInvoices, listCustomerLinks, listCustomerPayments } from "@/lib/customer-portal";
import { formatDateDisplay, money } from "@/lib/format";
import { LinkClientForm } from "@/components/LinkClientForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My invoices — Groundwork" };

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-emerald-400",
  SENT: "text-amber-400",
};

export default async function MyInvoicesPage() {
  const customer = await customerOrRedirect();
  const [invoices, payments, links] = await Promise.all([
    listCustomerInvoices(customer.customerId),
    listCustomerPayments(customer.customerId),
    listCustomerLinks(customer.customerId),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
      <div>
        <h2 className="font-display text-xl font-bold text-white">My invoices</h2>
        <p className="text-sm text-slate-500">Signed in as {customer.name || customer.email}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.03em] text-slate-500">
              <th className="px-4 py-3 font-medium">Doc #</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  {links.length === 0
                    ? "No invoices yet. Enter the portal code from your contractor below to link your account."
                    : "No invoices have been sent to you yet."}
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const href = `/customer/invoices/${inv.id}`;
                const label = inv.status === "PAID" ? "paid" : inv.type === "ESTIMATE" ? "estimate" : "due";
                return (
                  <tr key={inv.id} className="border-b border-white/5 last:border-0">
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3.5 font-mono text-slate-300 hover:text-white">
                        {inv.docNumber}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3.5 text-slate-100">
                        {inv.company.name || "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3.5 font-mono text-[13px] text-slate-500">
                        {formatDateDisplay(inv.date)}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3.5">
                        <span
                          className={`rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLASS[inv.status] ?? "text-slate-400"}`}
                        >
                          {label}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3.5 text-right font-mono text-slate-100">
                        {money(inv.totals.total)}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h3 className="mb-3 font-display text-base font-semibold text-white">Payment history</h3>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-500">No payments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink px-3 py-2"
                >
                  <Link href={`/customer/invoices/${p.documentId}`} className="font-mono text-slate-300 hover:text-white">
                    {p.docNumber}
                  </Link>
                  <span className="text-xs text-slate-500">{formatDateDisplay(p.createdAt)}</span>
                  <span className={`text-xs ${p.outcome === "APPLIED" ? "text-emerald-400" : "text-amber-400"}`}>
                    {p.outcome === "APPLIED" ? "Paid" : "Under review"}
                  </span>
                  <span className="font-mono text-slate-100">{money(p.amountCents / 100)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-600">All payments are Stripe Sandbox test payments.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h3 className="mb-1 font-display text-base font-semibold text-white">Linked accounts</h3>
          <p className="mb-3 text-xs text-slate-500">
            Your contractor gives you a one-time portal code to link your account to their records.
          </p>
          {links.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5 text-sm">
              {links.map((l) => (
                <li key={l.id} className="text-slate-300">
                  {l.clientName} <span className="text-slate-500">· {l.companyName || "Contractor"}</span>
                </li>
              ))}
            </ul>
          )}
          <LinkClientForm />
        </div>
      </div>
    </main>
  );
}
