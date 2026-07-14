import type { DocumentStatus, DocumentType } from "@/generated/prisma/enums";

export type LineItemRecord = {
  id: string;
  label: string;
  qty: number;
  unit: string;
  rate: number;
  sortOrder: number;
};

export type DocumentRecord = {
  id: string;
  type: DocumentType;
  docNumber: string;
  status: DocumentStatus;
  date: string; // ISO
  dueDate: string | null; // ISO
  clientId: string | null;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  notesText: string;
  discountPercent: number;
  discountLabel: string;
  taxRate: number;
  footerNote: string;
  stripePaymentLinkUrl: string | null;
  paidAt: string | null; // ISO
  sentAt: string | null; // ISO
  lineItems: LineItemRecord[];
};

export type ClientRecord = {
  id: string;
  name: string;
  address: string;
  email: string | null;
  phone: string | null;
  jobCount: number;
  lifetime: number;
};

export type CompanyRecord = {
  id: string;
  name: string;
  logoUrl: string | null;
  defaultTaxRate: number;
  defaultFooter: string;
};

export type InventoryItemRecord = {
  id: string;
  key: string;
  label: string;
  unit: string;
  rate: number;
  matchTerm: string;
};
