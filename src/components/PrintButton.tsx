"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink shadow-[0_10px_25px_-10px_rgba(16,185,129,0.4)] hover:bg-emerald-400 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
        <path
          d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Export / Print PDF</span>
    </button>
  );
}
