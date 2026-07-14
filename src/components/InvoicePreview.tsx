import { initials } from "@/lib/format";

export type PreviewLineItem = {
  id: string;
  label: string;
  qty: number;
  unit: string;
  rateDisplay: string;
  amountDisplay: string;
};

export type InvoicePreviewProps = {
  docTypeLabel: "INVOICE" | "ESTIMATE";
  docNumber: string;
  companyName: string;
  companyLogoUrl: string | null;
  clientName: string;
  clientAddress: string;
  dateLabel: string;
  dateDisplay: string;
  dueDateLabel: string;
  dueDateDisplay: string;
  status: "draft" | "sent" | "paid";
  items: PreviewLineItem[];
  discountPercent: number;
  discountLabel: string;
  discountAmountDisplay: string;
  taxRatePercent: number;
  taxAmountDisplay: string;
  subtotalDisplay: string;
  totalDisplay: string;
  totalLabel: string;
  footerNote: string;
};

const STATUS_TEXT_COLOR: Record<InvoicePreviewProps["status"], string> = {
  paid: "text-emerald-700",
  sent: "text-amber-700",
  draft: "text-slate-500",
};

export function InvoicePreview(props: InvoicePreviewProps) {
  const {
    docTypeLabel,
    docNumber,
    companyName,
    companyLogoUrl,
    clientName,
    clientAddress,
    dateLabel,
    dateDisplay,
    dueDateLabel,
    dueDateDisplay,
    status,
    items,
    discountPercent,
    discountLabel,
    discountAmountDisplay,
    taxRatePercent,
    taxAmountDisplay,
    subtotalDisplay,
    totalDisplay,
    totalLabel,
    footerNote,
  } = props;

  const showWatermark = status === "draft" || status === "paid";
  const watermarkText = status === "paid" ? "PAID" : "DRAFT";
  const watermarkColor = status === "paid" ? "#059669" : "#0f172a";

  return (
    <div
      id="invoice-paper"
      className="ledger-paper relative overflow-hidden rounded-sm p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]"
    >
      {showWatermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="status-watermark" style={{ color: watermarkColor }}>
            {watermarkText}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4 border-b-2 border-[rgba(26,31,24,0.15)] pb-6">
        <div className="flex min-w-0 items-center gap-3">
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={companyLogoUrl}
              alt=""
              className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-display text-lg font-bold text-white">
              {initials(companyName)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-display text-lg font-bold leading-tight">
              {companyName || "Your Company Name"}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#6b7060]">Licensed &amp; Insured</div>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-display text-2xl font-bold tracking-[0.1em] text-emerald-700">
            {docTypeLabel}
          </div>
          <div className="mt-1 font-mono text-xs text-[#6b7060]">{docNumber}</div>
        </div>
      </div>

      {/* Bill-to / dates */}
      <div className="relative grid grid-cols-2 gap-4 py-6 text-sm">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.03em] text-[#6b7060]">Bill To</div>
          <div className="font-semibold">{clientName || "No client yet"}</div>
          <div className="mt-0.5 text-[#4a4f42]">
            {clientAddress || "Run Magic Parse or type an address"}
          </div>
        </div>
        <div className="text-right font-mono text-xs">
          <div>
            <span className="text-[#6b7060]">{dateLabel}: </span>
            {dateDisplay}
          </div>
          <div className="mt-1">
            <span className="text-[#6b7060]">{dueDateLabel}: </span>
            {dueDateDisplay}
          </div>
          <div className="mt-1">
            <span className="text-[#6b7060]">Status: </span>
            <span className={`font-semibold uppercase ${STATUS_TEXT_COLOR[status]}`}>{status}</span>
          </div>
        </div>
      </div>

      {/* Line items */}
      <table className="relative w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[rgba(26,31,24,0.15)] text-left text-[11px] uppercase tracking-[0.03em] text-[#6b7060]">
            <th className="pb-2 pr-2 font-medium">Description</th>
            <th className="px-2 pb-2 text-right font-medium">Qty</th>
            <th className="px-2 pb-2 font-medium">Unit</th>
            <th className="px-2 pb-2 text-right font-medium">Rate</th>
            <th className="pb-2 pl-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center italic text-[#8a8f80]">
                No line items yet
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-b border-[rgba(26,31,24,0.1)]">
                <td className="py-2.5 pr-2">{item.label}</td>
                <td className="px-2 py-2.5 text-right font-mono">{item.qty}</td>
                <td className="px-2 py-2.5 text-[#6b7060]">{item.unit}</td>
                <td className="px-2 py-2.5 text-right font-mono">{item.rateDisplay}</td>
                <td className="py-2.5 pl-2 text-right font-mono font-medium">{item.amountDisplay}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="relative flex justify-end pt-5">
        <div className="flex w-full max-w-[260px] flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6b7060]">Subtotal</span>
            <span className="font-mono">{subtotalDisplay}</span>
          </div>
          {discountPercent > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>
                {discountLabel || "Discount"} ({discountPercent}%)
              </span>
              <span className="font-mono">-{discountAmountDisplay}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#6b7060]">Sales Tax ({taxRatePercent}%)</span>
            <span className="font-mono">{taxAmountDisplay}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t-2 border-[rgba(26,31,24,0.15)] pt-3">
            <span className="font-display font-semibold">{totalLabel}</span>
            <span className="rounded-md bg-emerald-600 px-3 py-1 font-display text-lg font-bold text-white">
              {totalDisplay}
            </span>
          </div>
        </div>
      </div>

      {footerNote && (
        <div className="relative mt-8 border-t border-dashed border-[rgba(26,31,24,0.2)] pt-4 text-xs italic text-[#4a4f42]">
          {footerNote}
        </div>
      )}
      <div className="relative mt-6 text-center font-mono text-[10px] text-[#8a8f80]">
        Generated with Groundwork — thank you for your business.
      </div>
    </div>
  );
}
