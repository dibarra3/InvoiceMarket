import Link from "next/link";
import { InvoicePreview } from "@/components/InvoicePreview";
import { PayInvoiceButton } from "@/components/PayInvoiceButton";
import { PaymentStatusPoller } from "@/components/PaymentStatusPoller";
import { TestModeBanner } from "@/components/TestModeBanner";
import { USD_MIN_CENTS, amountInCents } from "@/lib/checkout";
import { formatDateDisplay, money } from "@/lib/format";
import type { ActionResult } from "@/lib/errors";
import type { PublicInvoice, PublicPayment } from "@/lib/public-invoice";

type PayAction = () => Promise<ActionResult<{ url: string }>>;

const STATUS_CLASS: Record<PublicInvoice["status"], string> = {
  PAID: "text-emerald-400",
  SENT: "text-amber-400",
  DRAFT: "text-slate-400",
};

function PaymentHistory({ payments }: { payments: PublicPayment[] }) {
  if (payments.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <h3 className="mb-3 font-display text-base font-semibold text-white">Payment history</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-ink px-3 py-2">
            <span className="text-slate-400">{formatDateDisplay(p.createdAt)}</span>
            <span className={p.outcome === "APPLIED" ? "text-emerald-400" : "text-amber-400"}>
              {p.outcome === "APPLIED" ? "Paid" : "Received · under review"}
            </span>
            <span className="font-mono text-slate-100">{money(p.amountCents / 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The customer-facing invoice: summary, pay/PDF actions, payment history, and the same
 * ledger-paper preview the business sees. Shared by guest links and the customer portal. */
export function CustomerInvoiceView({
  invoice,
  payAction,
  pdfHref,
  backLink,
  result,
}: {
  invoice: PublicInvoice;
  payAction: PayAction;
  pdfHref: string;
  backLink?: { href: string; label: string };
  result?: "success" | "canceled";
}) {
  const isEstimate = invoice.type === "ESTIMATE";
  const paid = invoice.status === "PAID";
  const amountCents = amountInCents(invoice.lineItems, invoice.discountPercent, invoice.taxRate);
  const payable = !isEstimate && !paid && amountCents >= USD_MIN_CENTS;
  const fmt = (iso: string | null) => (iso ? formatDateDisplay(iso) : "—");

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_1.15fr]">
      <section className="flex min-w-0 flex-col gap-5">
        {backLink && (
          <Link href={backLink.href} className="text-xs font-semibold text-slate-500 hover:text-slate-300">
            ← {backLink.label}
          </Link>
        )}

        {result === "success" &&
          (paid ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="font-semibold text-emerald-300">Payment received — thank you!</p>
              <p className="mt-0.5 text-xs text-emerald-300/80">Stripe confirmed your payment and this invoice is now paid.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-card p-4">
              <p className="font-semibold text-white">Confirming your payment…</p>
              <p className="text-xs text-slate-400">
                Stripe has your payment details. This invoice is marked paid only after Stripe confirms the
                payment to {invoice.company.name || "the business"} directly, usually within a few seconds.
              </p>
              <PaymentStatusPoller />
            </div>
          ))}

        {result === "canceled" && !paid && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-300">Payment canceled</p>
            <p className="mt-0.5 text-xs text-amber-300/80">
              You haven&apos;t been charged. You can try again whenever you&apos;re ready.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-card p-5">
          <p className="text-xs text-slate-500">{invoice.company.name || "Your contractor"}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white">
              {isEstimate ? "Estimate" : "Invoice"} <span className="font-mono">{invoice.docNumber}</span>
            </h2>
            <span
              className={`rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLASS[invoice.status]}`}
            >
              {paid ? "paid" : isEstimate ? "estimate" : "due"}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">{isEstimate ? "Estimated total" : "Amount"}</dt>
              <dd className="font-mono text-lg text-slate-100">{money(invoice.totals.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{paid ? "Paid on" : isEstimate ? "Valid until" : "Due"}</dt>
              <dd className="font-mono text-slate-300">{paid ? fmt(invoice.paidAt) : fmt(invoice.dueDate)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-col gap-3">
            {payable && (
              <>
                <TestModeBanner />
                <PayInvoiceButton action={payAction} label={`Pay ${money(invoice.totals.total)} (test mode)`} />
              </>
            )}
            {!isEstimate && !paid && !payable && (
              <p className="text-xs text-slate-500">
                This invoice is below Stripe&apos;s $0.50 minimum and can&apos;t be paid online.
              </p>
            )}
            {isEstimate && <p className="text-xs text-slate-500">This is an estimate — there&apos;s nothing to pay yet.</p>}
            <a
              href={pdfHref}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100"
            >
              Download PDF
            </a>
          </div>
        </div>

        <PaymentHistory payments={invoice.payments} />
      </section>

      <section className="min-w-0 self-start lg:sticky lg:top-24">
        <InvoicePreview
          docTypeLabel={isEstimate ? "ESTIMATE" : "INVOICE"}
          docNumber={invoice.docNumber}
          companyName={invoice.company.name}
          companyLogoUrl={invoice.company.logoUrl}
          clientName={invoice.clientName}
          clientAddress={invoice.clientAddress}
          dateLabel={isEstimate ? "Estimate Date" : "Invoice Date"}
          dateDisplay={fmt(invoice.date)}
          dueDateLabel={isEstimate ? "Valid Until" : "Due Date"}
          dueDateDisplay={fmt(invoice.dueDate)}
          status={invoice.status === "PAID" ? "paid" : "sent"}
          items={invoice.lineItems.map((li) => ({
            id: li.id,
            label: li.label,
            qty: li.qty,
            unit: li.unit,
            rateDisplay: money(li.rate),
            amountDisplay: money(li.qty * li.rate),
          }))}
          discountPercent={invoice.discountPercent}
          discountLabel={invoice.discountLabel}
          discountAmountDisplay={money(invoice.totals.discountAmount)}
          taxRatePercent={invoice.taxRate}
          taxAmountDisplay={money(invoice.totals.taxAmount)}
          subtotalDisplay={money(invoice.totals.subtotal)}
          totalDisplay={money(invoice.totals.total)}
          totalLabel={isEstimate ? "Estimated Total" : paid ? "Total Paid" : "Total Due"}
          footerNote={invoice.footerNote}
        />
      </section>
    </main>
  );
}
