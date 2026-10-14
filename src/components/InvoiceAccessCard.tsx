"use client";

import { useState } from "react";
import { getInvoiceAccess, rotateInvoiceAccess, type InvoiceAccessDetails } from "@/lib/access-actions";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="block text-xs text-slate-500">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-ink px-3 py-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="w-full truncate bg-transparent font-mono text-xs text-slate-300 outline-none"
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex-shrink-0 text-xs font-semibold text-emerald-400"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Owner-only: the guest link / access code to share with the client, plus which customer
 * portal accounts can see this document through its client record. */
export function InvoiceAccessCard({ documentId, isDraft }: { documentId: string; isDraft: boolean }) {
  const [access, setAccess] = useState<InvoiceAccessDetails | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: typeof getInvoiceAccess) {
    setPending(true);
    setError(null);
    const result = await action(documentId).catch(() => null);
    if (result?.ok) setAccess(result.access);
    else setError(result?.error ?? "Something went wrong.");
    setPending(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-white">Client Access</h2>
        <span className="font-mono text-[11px] text-slate-500">guest link · portal</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Clients can open this document with its private link, or at <span className="font-mono">/pay</span> with
        the doc number and access code.
        {isDraft && " Neither works until it's sent."}
      </p>

      {!access ? (
        <button
          type="button"
          onClick={() => run(getInvoiceAccess)}
          disabled={pending}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 disabled:opacity-60"
        >
          {pending ? "Loading…" : "Show link & access code"}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <CopyRow label="Private invoice link" value={access.link} />
          <CopyRow label="Access code (use with the doc number)" value={access.code} />
          <p className="text-[11px] text-slate-500">
            Customer portal:{" "}
            {!access.clientName
              ? "no client on this document yet."
              : access.portalCustomers.length === 0
                ? `nobody is linked to "${access.clientName}" yet — issue a portal code from Clients.`
                : `visible to ${access.portalCustomers.join(", ")} via "${access.clientName}".`}
          </p>
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset the link and access code? Anything you've already shared will stop working.")) {
                run(rotateInvoiceAccess);
              }
            }}
            disabled={pending}
            className="self-start text-xs font-semibold text-slate-500 hover:text-red-400 disabled:opacity-60"
          >
            {pending ? "Resetting…" : "Reset link & code"}
          </button>
        </div>
      )}
      {error && <p className="mt-2.5 font-mono text-xs text-amber-400">{error}</p>}
    </div>
  );
}
