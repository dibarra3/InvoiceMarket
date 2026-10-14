import type { Prisma } from "@/generated/prisma/client";
import { DocumentStatus } from "@/generated/prisma/enums";
import { computeTotals, type Totals } from "./totals";
import type { CompanyRecord, DocumentRecord } from "./types";

/** Customers and guests only ever see documents that have actually been sent — never drafts. */
export const CLIENT_VISIBLE_STATUSES: DocumentStatus[] = [DocumentStatus.SENT, DocumentStatus.PAID];

export const publicDocumentInclude = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  company: { select: { id: true, name: true, logoUrl: true } },
  payments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.DocumentInclude;

export type PublicDocument = Prisma.DocumentGetPayload<{ include: typeof publicDocumentInclude }>;

export type PublicPayment = {
  id: string;
  amountCents: number;
  currency: string;
  outcome: "APPLIED" | "NEEDS_REVIEW";
  createdAt: string;
};

/** What a customer or guest is allowed to see: no internal job notes, Stripe ids, or
 * other company data. */
export type PublicInvoice = {
  id: string;
  type: "INVOICE" | "ESTIMATE";
  docNumber: string;
  status: "DRAFT" | "SENT" | "PAID";
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  clientName: string;
  clientAddress: string;
  lineItems: { id: string; label: string; qty: number; unit: string; rate: number; sortOrder: number }[];
  discountPercent: number;
  discountLabel: string;
  taxRate: number;
  footerNote: string;
  company: { name: string; logoUrl: string | null };
  totals: Totals;
  payments: PublicPayment[];
};

export function toPublicInvoice(doc: PublicDocument): PublicInvoice {
  return {
    id: doc.id,
    type: doc.type,
    docNumber: doc.docNumber,
    status: doc.status,
    date: doc.date.toISOString(),
    dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    clientName: doc.clientName,
    clientAddress: doc.clientAddress,
    lineItems: doc.lineItems.map((li) => ({
      id: li.id,
      label: li.label,
      qty: li.qty,
      unit: li.unit,
      rate: li.rate,
      sortOrder: li.sortOrder,
    })),
    discountPercent: doc.discountPercent,
    discountLabel: doc.discountLabel,
    taxRate: doc.taxRate,
    footerNote: doc.footerNote,
    company: { name: doc.company.name, logoUrl: doc.company.logoUrl },
    totals: computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate),
    payments: doc.payments.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      outcome: p.outcome,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/** Adapts a PublicInvoice to the inputs `renderInvoicePdf` expects, with internal-only
 * fields blanked out. */
export function toPdfInputs(inv: PublicInvoice): { doc: DocumentRecord; company: CompanyRecord } {
  return {
    doc: {
      id: inv.id,
      type: inv.type,
      docNumber: inv.docNumber,
      status: inv.status,
      date: inv.date,
      dueDate: inv.dueDate,
      clientId: null,
      clientName: inv.clientName,
      clientAddress: inv.clientAddress,
      clientEmail: "",
      notesText: "",
      discountPercent: inv.discountPercent,
      discountLabel: inv.discountLabel,
      taxRate: inv.taxRate,
      footerNote: inv.footerNote,
      stripePaymentLinkUrl: null,
      paidAt: inv.paidAt,
      sentAt: null,
      lineItems: inv.lineItems,
    },
    company: {
      id: "",
      name: inv.company.name,
      logoUrl: inv.company.logoUrl,
      defaultTaxRate: 0,
      defaultFooter: "",
    },
  };
}
