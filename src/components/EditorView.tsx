"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addLineItem,
  applyParseResult,
  deleteDocument,
  duplicateDocument,
  removeLineItem,
  updateCompany,
  updateDocument,
  updateLineItem,
} from "@/lib/actions";
import { createPaymentLink } from "@/lib/payment-actions";
import { sendDocumentEmail } from "@/lib/email-actions";
import { DocumentStatus, DocumentType } from "@/generated/prisma/enums";
import { computeTotals } from "@/lib/totals";
import { money, toDateInputValue } from "@/lib/format";
import { VOICE_SAMPLES } from "@/lib/parse";
import { InvoicePreview } from "@/components/InvoicePreview";
import type { CompanyRecord, DocumentRecord, InventoryItemRecord } from "@/lib/types";

type EditableLineItem = {
  id: string;
  label: string;
  qty: number;
  unit: string;
  rate: number;
};

type ParseTone = "muted" | "warn" | "good";

const TONE_CLASS: Record<ParseTone, string> = {
  muted: "text-slate-500",
  warn: "text-amber-400",
  good: "text-emerald-400",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60";
const labelClass = "block text-xs text-slate-500";

export function EditorView({
  document,
  company,
  inventory,
  role,
}: {
  document: DocumentRecord;
  company: CompanyRecord;
  inventory: InventoryItemRecord[];
  role: "OWNER" | "FIELD_CREW";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [docType, setDocTypeState] = useState<DocumentType>(document.type);
  const [docNumber, setDocNumber] = useState(document.docNumber);
  const [status, setStatus] = useState<DocumentStatus>(document.status);
  const [date, setDate] = useState(toDateInputValue(document.date));
  const [dueDate, setDueDate] = useState(toDateInputValue(document.dueDate));
  const [clientName, setClientName] = useState(document.clientName);
  const [clientAddress, setClientAddress] = useState(document.clientAddress);
  const [clientEmail, setClientEmail] = useState(document.clientEmail);
  const [notesText, setNotesText] = useState(document.notesText);
  const [items, setItems] = useState<EditableLineItem[]>(
    document.lineItems.map((li) => ({ id: li.id, label: li.label, qty: li.qty, unit: li.unit, rate: li.rate }))
  );
  const [discountPercent, setDiscountPercent] = useState(document.discountPercent);
  const [discountLabel, setDiscountLabel] = useState(document.discountLabel);
  const [taxRate, setTaxRate] = useState(document.taxRate);
  const [footerNote, setFooterNote] = useState(document.footerNote);
  const [companyName, setCompanyName] = useState(company.name);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(company.logoUrl);

  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<{ text: string; tone: ParseTone }>({
    text: "",
    tone: "muted",
  });
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [paymentLink, setPaymentLink] = useState<string | null>(document.stripePaymentLinkUrl);
  const [paymentState, setPaymentState] = useState<{ text: string; tone: ParseTone }>({
    text: "",
    tone: "muted",
  });
  const [creatingLink, setCreatingLink] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [sendState, setSendState] = useState<{ text: string; tone: ParseTone }>({ text: "", tone: "muted" });
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(document.sentAt);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEstimate = docType === DocumentType.ESTIMATE;
  const locked = status !== DocumentStatus.DRAFT;
  const isOwner = role === "OWNER";

  function persistDocument(patch: Parameters<typeof updateDocument>[1]) {
    setSaveState("saving");
    startTransition(() => {
      updateDocument(document.id, patch)
        .catch((err) => console.error("Failed to save document", err))
        .finally(() => setSaveState("saved"));
    });
  }

  function handleSetDocType(next: DocumentType) {
    if (locked) return;
    const numericPart = docNumber.replace(/^[A-Za-z]+-/, "");
    const nextNumber = `${next === DocumentType.ESTIMATE ? "EST" : "INV"}-${numericPart}`;
    setDocTypeState(next);
    setDocNumber(nextNumber);
    persistDocument({ type: next, docNumber: nextNumber });
  }

  async function handleDuplicate() {
    setDuplicating(true);
    setLockError(null);
    try {
      const newId = await duplicateDocument(document.id);
      router.push(`/editor/${newId}`);
    } catch (err) {
      console.error("Failed to duplicate document", err);
      setLockError(err instanceof Error ? err.message : "Couldn't duplicate this document.");
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${docNumber}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDocument(document.id);
      router.push("/invoices");
    } catch (err) {
      console.error("Failed to delete document", err);
      alert(err instanceof Error ? err.message : "Couldn't delete this document.");
      setDeleting(false);
    }
  }

  function handleVoiceClick() {
    const sample = VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)];
    setNotesText(sample);
    setParseStatus({ text: "Dictation captured — hit Magic Parse to extract the job.", tone: "muted" });
  }

  async function handleParseClick() {
    if (locked) {
      setParseStatus({ text: "This document is locked — duplicate it to change line items.", tone: "warn" });
      return;
    }
    const text = notesText.trim();
    if (!text) {
      setParseStatus({
        text: "Add some notes first — type them in or hit Simulate Voice Dictation.",
        tone: "warn",
      });
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text, inventory }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Parse request failed (${res.status})`);
      }
      const result: {
        clientName: string | null;
        clientAddress: string | null;
        lineItems: { label: string; qty: number; unit: string; rate: number }[];
        discountPercent: number;
        discountLabel: string;
        summary: string;
        foundNothing: boolean;
      } = await res.json();

      if (result.foundNothing) {
        // Nothing usable came back — save the raw notes but don't touch existing line
        // items, since applying an empty result would wipe them.
        await updateDocument(document.id, { notesText: text }).catch((err) =>
          console.error("Failed to save notes", err)
        );
        setParseStatus({ text: result.summary, tone: "warn" });
        return;
      }

      const updated = await applyParseResult(document.id, {
        clientName: result.clientName,
        clientAddress: result.clientAddress,
        lineItems: result.lineItems,
        discountPercent: result.discountPercent,
        discountLabel: result.discountLabel,
      });
      // Keep the raw notes in sync too, in case the textarea was never blurred.
      await updateDocument(document.id, { notesText: text }).catch((err) =>
        console.error("Failed to save notes", err)
      );
      setClientName(updated.clientName);
      setClientAddress(updated.clientAddress);
      setClientEmail(updated.clientEmail);
      setItems(
        updated.lineItems.map((li) => ({ id: li.id, label: li.label, qty: li.qty, unit: li.unit, rate: li.rate }))
      );
      setDiscountPercent(updated.discountPercent);
      setDiscountLabel(updated.discountLabel);
      setParseStatus({ text: `✓ ${result.summary}`, tone: "good" });
    } catch (err) {
      console.error("Failed to parse job notes", err);
      const message = err instanceof Error ? err.message : "Something went wrong parsing your notes — try again.";
      setParseStatus({ text: message, tone: "warn" });
    } finally {
      setParsing(false);
    }
  }

  async function handleSendEmail() {
    if (!clientEmail.trim()) {
      setSendState({ text: "Add a client email address first.", tone: "warn" });
      return;
    }
    setSending(true);
    setSendState({ text: "", tone: "muted" });
    try {
      await sendDocumentEmail(document.id, { to: clientEmail, message: emailMessage });
      setSentAt(new Date().toISOString());
      if (status === DocumentStatus.DRAFT) setStatus(DocumentStatus.SENT);
      setSendState({ text: `✓ Sent to ${clientEmail}.`, tone: "good" });
    } catch (err) {
      console.error("Failed to send invoice email", err);
      const message = err instanceof Error ? err.message : "Couldn't send the email.";
      setSendState({ text: message, tone: "warn" });
    } finally {
      setSending(false);
    }
  }

  async function handleCreatePaymentLink() {
    setCreatingLink(true);
    setPaymentState({ text: "", tone: "muted" });
    try {
      const url = await createPaymentLink(document.id);
      setPaymentLink(url);
      setPaymentState({ text: "Payment link ready — copy it or open it below.", tone: "good" });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to create payment link", err);
      const message = err instanceof Error ? err.message : "Couldn't create a payment link.";
      setPaymentState({ text: message, tone: "warn" });
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleAddItem() {
    if (locked) return;
    try {
      const id = await addLineItem(document.id);
      setItems((prev) => [...prev, { id, label: "New Item", qty: 1, unit: "each", rate: 0 }]);
    } catch (err) {
      console.error("Failed to add line item", err);
    }
  }

  function handleItemLocalChange(id: string, patch: Partial<EditableLineItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleItemPersist(id: string, patch: Partial<Pick<EditableLineItem, "label" | "qty" | "unit" | "rate">>) {
    if (locked) return;
    setSaveState("saving");
    startTransition(() => {
      updateLineItem(id, patch)
        .catch((err) => console.error("Failed to save line item", err))
        .finally(() => setSaveState("saved"));
    });
  }

  async function handleRemoveItem(id: string) {
    if (locked) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await removeLineItem(id);
    } catch (err) {
      console.error("Failed to remove line item", err);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCompanyLogoUrl(dataUrl);
      setSaveState("saving");
      startTransition(() => {
        updateCompany({ logoUrl: dataUrl })
          .catch((err) => console.error("Failed to save logo", err))
          .finally(() => setSaveState("saved"));
      });
    };
    reader.readAsDataURL(file);
  }

  function persistCompanyName(name: string) {
    setSaveState("saving");
    startTransition(() => {
      updateCompany({ name })
        .catch((err) => console.error("Failed to save company name", err))
        .finally(() => setSaveState("saved"));
    });
  }

  const totals = computeTotals(items, discountPercent, taxRate);
  const dateLabel = isEstimate ? "Estimate Date" : "Invoice Date";
  const dueDateLabel = isEstimate ? "Valid Until" : "Due Date";
  const previewStatus = status.toLowerCase() as "draft" | "sent" | "paid";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1.05fr_1fr]">
      {/* LEFT: INPUT */}
      <section className="flex min-w-0 flex-col gap-5">
        {/* Doc type toggle + delete */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex w-fit gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => handleSetDocType(DocumentType.INVOICE)}
              disabled={locked}
              className={
                !isEstimate
                  ? "rounded-md bg-emerald-500 px-4 py-1.5 font-display text-sm font-semibold text-ink disabled:opacity-70"
                  : "rounded-md bg-transparent px-4 py-1.5 font-display text-sm font-semibold text-slate-400 disabled:opacity-50"
              }
            >
              Invoice
            </button>
            <button
              type="button"
              onClick={() => handleSetDocType(DocumentType.ESTIMATE)}
              disabled={locked}
              className={
                isEstimate
                  ? "rounded-md bg-emerald-500 px-4 py-1.5 font-display text-sm font-semibold text-ink disabled:opacity-70"
                  : "rounded-md bg-transparent px-4 py-1.5 font-display text-sm font-semibold text-slate-400 disabled:opacity-50"
              }
            >
              Estimate
            </button>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5">
                <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
              </svg>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>

        {/* Locked banner */}
        {locked && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-300">
                {status === DocumentStatus.PAID ? "This invoice has been paid." : "This document has been sent."}
              </p>
              <p className="mt-0.5 text-xs text-amber-300/80">
                Line items and totals are locked. Duplicate it as a new draft to make changes.
              </p>
              {lockError && <p className="mt-1 text-xs text-red-400">{lockError}</p>}
            </div>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={duplicating}
              className="flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-ink disabled:opacity-70"
            >
              {duplicating ? "Duplicating…" : "Duplicate as New Draft"}
            </button>
          </div>
        )}

        {/* Job Notes */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Job Notes</h2>
            <span className="font-mono text-[11px] text-slate-500">raw / messy is fine</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Paste your notes, or dictate on-site, then let Groundwork sort it out.
          </p>
          <textarea
            rows={5}
            placeholder="e.g. Jones job at 123 Main St. Used 3 pallets of Bermuda sod, 4 hours of labor. Hook him up with a 10% military discount."
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onBlur={() => persistDocument({ notesText })}
            className="w-full resize-none rounded-lg border border-white/10 bg-ink p-3 text-sm leading-relaxed text-slate-100 outline-none focus:border-emerald-500/60"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleVoiceClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-emerald-400">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
              </svg>
              Simulate Voice Dictation
            </button>
            <button
              type="button"
              onClick={handleParseClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink shadow-[0_10px_25px_-10px_rgba(16,185,129,0.4)] disabled:opacity-70"
              disabled={parsing || locked}
            >
              {parsing && <span className="h-4 w-4 animate-spin-fast rounded-full border-2 border-ink/30 border-t-ink" />}
              <span>{parsing ? "Parsing…" : "✨ Magic Parse"}</span>
            </button>
          </div>
          <p className={`mt-2.5 min-h-[16px] font-mono text-xs ${TONE_CLASS[parseStatus.tone]}`}>
            {parseStatus.text}
          </p>
        </div>

        {/* Job Details */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-white">Job Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block">
              <span className={labelClass}>Client / Job Name</span>
              <input
                type="text"
                placeholder="e.g. Jones"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onBlur={() => persistDocument({ clientName, clientAddress, clientEmail })}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 block">
              <span className={labelClass}>Job Address</span>
              <input
                type="text"
                placeholder="e.g. 123 Main St"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                onBlur={() => persistDocument({ clientName, clientAddress, clientEmail })}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 block">
              <span className={labelClass}>Client Email</span>
              <input
                type="email"
                placeholder="e.g. jones@example.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                onBlur={() => persistDocument({ clientName, clientAddress, clientEmail })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Doc #</span>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                onBlur={() => persistDocument({ docNumber })}
                disabled={locked}
                className={`${inputClass} font-mono disabled:opacity-60`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Status</span>
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as DocumentStatus;
                  setStatus(next);
                  persistDocument({ status: next });
                }}
                disabled={!isOwner}
                className={`${inputClass} disabled:opacity-60`}
              >
                <option value={DocumentStatus.DRAFT}>Draft</option>
                <option value={DocumentStatus.SENT}>Sent</option>
                <option value={DocumentStatus.PAID}>Paid</option>
              </select>
              {!isOwner && <span className="mt-1 block text-[11px] text-slate-600">Only owners can change status.</span>}
            </label>
            <label className="block">
              <span className={labelClass}>{dateLabel}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  persistDocument({ date: e.target.value });
                }}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{dueDateLabel}</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  persistDocument({ dueDate: e.target.value });
                }}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {/* Payment link (invoices only, Owner-only) */}
        {!isEstimate && isOwner && (
          <div className="rounded-xl border border-white/10 bg-card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">Get Paid Online</h2>
              <span className="font-mono text-[11px] text-slate-500">via Stripe</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Generates a Stripe Checkout link for the current total — send it to your client so
              they can pay by card.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreatePaymentLink}
                disabled={creatingLink}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
              >
                {creatingLink && (
                  <span className="h-4 w-4 animate-spin-fast rounded-full border-2 border-ink/30 border-t-ink" />
                )}
                {creatingLink ? "Creating link…" : paymentLink ? "Regenerate Payment Link" : "Create Payment Link"}
              </button>
            </div>
            {paymentState.text && (
              <p className={`mt-2.5 font-mono text-xs ${TONE_CLASS[paymentState.tone]}`}>{paymentState.text}</p>
            )}
            {paymentLink && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-ink px-3 py-2">
                <input
                  readOnly
                  value={paymentLink}
                  className="w-full truncate bg-transparent font-mono text-xs text-slate-400 outline-none"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(paymentLink)}
                  className="flex-shrink-0 text-xs font-semibold text-emerald-400"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}

        {/* PDF export + email delivery */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Send to Client</h2>
            <span className="font-mono text-[11px] text-slate-500">PDF · email</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            {sentAt ? `Last emailed ${new Date(sentAt).toLocaleString()}.` : "Not sent yet."}
          </p>
          <a
            href={`/api/documents/${document.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-emerald-400">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
            </svg>
            Download PDF
          </a>
          {isOwner ? (
            <>
              <label className="block">
                <span className={labelClass}>Message (optional)</span>
                <textarea
                  rows={2}
                  placeholder="Add a short note to include in the email…"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-ink p-3 text-sm leading-relaxed text-slate-100 outline-none focus:border-emerald-500/60"
                />
              </label>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sending}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
              >
                {sending && <span className="h-4 w-4 animate-spin-fast rounded-full border-2 border-ink/30 border-t-ink" />}
                {sending ? "Sending…" : `Email ${isEstimate ? "Estimate" : "Invoice"}`}
              </button>
              {sendState.text && (
                <p className={`mt-2.5 font-mono text-xs ${TONE_CLASS[sendState.tone]}`}>{sendState.text}</p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate-600">Only owners can email invoices to clients.</p>
          )}
        </div>

        {/* Line Items */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Line Items</h2>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={locked}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-400 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3.5 w-3.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add row
            </button>
          </div>

          {items.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">
              No line items yet — paste job notes above and hit Magic Parse, or add a row manually.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.03em] text-slate-500">
                    <th className="py-2 font-medium">Description</th>
                    <th className="w-16 py-2 font-medium">Qty</th>
                    <th className="w-20 py-2 font-medium">Unit</th>
                    <th className="w-24 py-2 font-medium">Rate</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 align-top">
                      <td className="py-1.5 pr-1">
                        <input
                          value={item.label}
                          onChange={(e) => handleItemLocalChange(item.id, { label: e.target.value })}
                          onBlur={(e) => handleItemPersist(item.id, { label: e.target.value })}
                          disabled={locked}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-100 focus:border-white/10 disabled:opacity-60"
                        />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.qty}
                          onChange={(e) => handleItemLocalChange(item.id, { qty: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => handleItemPersist(item.id, { qty: parseFloat(e.target.value) || 0 })}
                          disabled={locked}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-white/10 disabled:opacity-60"
                        />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input
                          value={item.unit}
                          onChange={(e) => handleItemLocalChange(item.id, { unit: e.target.value })}
                          onBlur={(e) => handleItemPersist(item.id, { unit: e.target.value })}
                          disabled={locked}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-slate-400 focus:border-white/10 disabled:opacity-60"
                        />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.rate}
                          onChange={(e) => handleItemLocalChange(item.id, { rate: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => handleItemPersist(item.id, { rate: parseFloat(e.target.value) || 0 })}
                          disabled={locked}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-white/10 disabled:opacity-60"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={locked}
                          className="text-slate-600 hover:text-slate-400 disabled:opacity-40"
                          aria-label="Remove line item"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <label className="block">
              <span className={labelClass}>Discount %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                onBlur={() => persistDocument({ discountPercent })}
                disabled={locked}
                className={`${inputClass} font-mono disabled:opacity-60`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Discount Label</span>
              <input
                type="text"
                placeholder="e.g. Military Discount"
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
                onBlur={() => persistDocument({ discountLabel })}
                disabled={locked}
                className={`${inputClass} disabled:opacity-60`}
              />
            </label>
            <label className="col-span-2 block">
              <span className={labelClass}>Sales Tax %</span>
              <input
                type="number"
                min={0}
                max={20}
                step={0.01}
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                onBlur={() => persistDocument({ taxRate })}
                disabled={locked}
                className={`${inputClass} font-mono disabled:opacity-60`}
              />
            </label>
          </div>
        </div>

        {/* Branding */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-white">Branding</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-500 font-display text-lg font-bold text-ink">
              {companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{companyName ? companyName.slice(0, 2).toUpperCase() : "YC"}</span>
              )}
            </div>
            <div className="flex-1">
              <label className="inline-block cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100">
                Upload logo
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              <p className="mt-1 text-[11px] text-slate-500">PNG/JPG, shown on your invoice header</p>
            </div>
          </div>
          <label className="mt-4 block">
            <span className={labelClass}>Company Name</span>
            <input
              type="text"
              placeholder="Your Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onBlur={() => persistCompanyName(companyName)}
              className={inputClass}
            />
          </label>
          <label className="mt-3 block">
            <span className={labelClass}>Footer Note</span>
            <input
              type="text"
              placeholder="e.g. Thanks for the business — see you next season."
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              onBlur={() => persistDocument({ footerNote })}
              className={inputClass}
            />
          </label>
        </div>

        {/* Price list reference */}
        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h2 className="mb-1 font-display text-base font-semibold text-white">Local Inventory Price List</h2>
          <p className="mb-3 text-xs text-slate-500">Magic Parse matches your notes against this list.</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
            {inventory.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-white/10 bg-ink px-2.5 py-2">
                <div className="text-slate-300">{inv.label}</div>
                <div className="text-emerald-400">
                  {money(inv.rate)}
                  <span className="text-slate-600">/{inv.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT: PREVIEW */}
      <section className="sticky top-24 self-start">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-mono text-xs uppercase tracking-[0.03em] text-slate-500">Live Preview</span>
          <span className="font-mono text-xs text-slate-600">
            {saveState === "saving" ? "Saving…" : "Saved"}
          </span>
        </div>
        <InvoicePreview
          docTypeLabel={isEstimate ? "ESTIMATE" : "INVOICE"}
          docNumber={docNumber}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          clientName={clientName}
          clientAddress={clientAddress}
          dateLabel={dateLabel}
          dateDisplay={date ? new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
          dueDateLabel={dueDateLabel}
          dueDateDisplay={dueDate ? new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
          status={previewStatus}
          items={items.map((it) => ({
            id: it.id,
            label: it.label,
            qty: it.qty,
            unit: it.unit,
            rateDisplay: money(it.rate),
            amountDisplay: money(it.qty * it.rate),
          }))}
          discountPercent={discountPercent}
          discountLabel={discountLabel}
          discountAmountDisplay={money(totals.discountAmount)}
          taxRatePercent={taxRate}
          taxAmountDisplay={money(totals.taxAmount)}
          subtotalDisplay={money(totals.subtotal)}
          totalDisplay={money(totals.total)}
          totalLabel={isEstimate ? "Estimated Total" : "Total Due"}
          footerNote={footerNote}
        />
      </section>
    </main>
  );
}
