"use client";

import { useState, useTransition } from "react";
import { updateCompany } from "@/lib/actions";
import type { CompanyRecord } from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60";
const labelClass = "text-xs text-slate-500";

export function SettingsForm({ company }: { company: CompanyRecord }) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(company.name);
  const [taxRate, setTaxRate] = useState(company.defaultTaxRate);
  const [footer, setFooter] = useState(company.defaultFooter);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  function persist(patch: Parameters<typeof updateCompany>[0]) {
    setSaveState("saving");
    startTransition(() => {
      updateCompany(patch)
        .catch((err) => console.error("Failed to save settings", err))
        .finally(() => setSaveState("saved"));
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-600">
          {saveState === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className={labelClass}>Default Company Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => persist({ name })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Default Sales Tax %</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.01}
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
            onBlur={() => persist({ defaultTaxRate: taxRate })}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Default Footer Note</span>
          <input
            type="text"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            onBlur={() => persist({ defaultFooter: footer })}
            className={inputClass}
          />
        </label>
        <p className="text-[11px] text-slate-600">
          These apply to new invoices/estimates by default. Team member accounts, notification
          preferences, and payment connections (e.g. Stripe) would live here too once wired to a
          real backend.
        </p>
      </div>
    </div>
  );
}
