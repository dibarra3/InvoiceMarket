import Link from "next/link";
import { auth } from "@/auth";
import { listDocuments } from "@/lib/actions";
import { computeTotals } from "@/lib/totals";
import { money, formatDateDisplay } from "@/lib/format";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-emerald-400",
  SENT: "text-amber-400",
  DRAFT: "text-slate-400",
};

export default async function InvoicesPage() {
  const [session, documents] = await Promise.all([auth(), listDocuments()]);
  const isOwner = session?.user?.role === "OWNER";

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-white">Invoices</h2>
        <Link
          href="/editor"
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink"
        >
          + New Invoice
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.03em] text-slate-500">
              <th className="px-4 py-3 font-medium">Doc #</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              {isOwner && <th className="w-10 px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={isOwner ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No invoices or estimates yet.{" "}
                  <Link href="/editor" className="text-emerald-400 underline">
                    Create your first one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const totals = computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate);
                return (
                  <tr key={doc.id} className="border-b border-white/5 last:border-0">
                    <td className="p-0">
                      <Link
                        href={`/editor/${doc.id}`}
                        className="block px-4 py-3.5 font-mono text-slate-400 hover:text-slate-200"
                      >
                        {doc.docNumber}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/editor/${doc.id}`} className="block px-4 py-3.5 font-medium text-slate-100">
                        {doc.clientName || "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/editor/${doc.id}`}
                        className="block px-4 py-3.5 font-mono text-[13px] text-slate-500"
                      >
                        {formatDateDisplay(doc.date)}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/editor/${doc.id}`} className="block px-4 py-3.5">
                        <span
                          className={`rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLASS[doc.status]}`}
                        >
                          {doc.status.toLowerCase()}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/editor/${doc.id}`}
                        className="block px-4 py-3.5 text-right font-mono text-slate-100"
                      >
                        {money(totals.total)}
                      </Link>
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3.5 text-center">
                        <DeleteDocumentButton documentId={doc.id} docNumber={doc.docNumber} />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
