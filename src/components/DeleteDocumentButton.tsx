"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument } from "@/lib/actions";

export function DeleteDocumentButton({ documentId, docNumber }: { documentId: string; docNumber: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${docNumber}? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    startTransition(() => {
      deleteDocument(documentId)
        .then(() => router.refresh())
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't delete."))
        .finally(() => setDeleting(false));
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={deleting}
      title={error ?? "Delete"}
      className="text-slate-600 hover:text-red-400 disabled:opacity-50"
      aria-label={`Delete ${docNumber}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="mx-auto h-4 w-4">
        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
      </svg>
    </button>
  );
}
