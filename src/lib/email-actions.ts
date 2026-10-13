"use server";

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireOwner } from "./session";
import { getCompany, getDocument } from "./actions";
import { renderInvoicePdf } from "./invoice-pdf";
import { computeTotals } from "./totals";
import { money, formatDateDisplay } from "./format";
import { DocumentStatus } from "@/generated/prisma/enums";
import { ensureGuestAccess } from "./guest-access";
import { resolveOrigin } from "./origin";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set. Add it to your .env to send invoice emails.");
  }
  return new Resend(key);
}

/** Emails the invoice/estimate PDF to a client via Resend, and marks a still-draft document
 * as SENT so the status reflects reality. Owner-only: Field Crew accounts can't send. */
export async function sendDocumentEmail(
  documentId: string,
  input: { to: string; message?: string }
): Promise<void> {
  const companyId = await requireOwner();
  const to = input.to.trim();
  if (!to) throw new Error("Enter a client email address first.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("That doesn't look like a valid email address.");
  }

  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");

  const company = await getCompany();
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!fromAddress) {
    throw new Error("RESEND_FROM_EMAIL is not set. Add it to your .env to send invoice emails.");
  }

  const pdfBuffer = await renderInvoicePdf(doc, company);
  const totals = computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate);
  const isEstimate = doc.type === "ESTIMATE";
  const docLabel = isEstimate ? "estimate" : "invoice";

  // Clients view and pay through their guest link (or /pay with the access code), which always
  // creates a fresh, correctly-priced Checkout Session — never a possibly-stale Stripe URL.
  const access = await ensureGuestAccess(companyId, documentId);
  const origin = await resolveOrigin();

  const resend = getResend();
  let error: { message?: string } | null;
  try {
    ({ error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject: `${doc.docNumber} from ${company.name || "Groundwork"} — ${money(totals.total)}`,
      text: [
        input.message?.trim(),
        `Please find attached ${docLabel} ${doc.docNumber}${doc.dueDate ? ` (due ${formatDateDisplay(doc.dueDate)})` : ""} for ${money(totals.total)}.`,
        `View${isEstimate ? "" : " and pay"} online: ${origin}/invoice/${access.token}`,
        `Or visit ${origin}/pay and enter ${doc.docNumber} with access code ${access.code}.`,
        company.defaultFooter || undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
      attachments: [{ filename: `${doc.docNumber}.pdf`, content: pdfBuffer }],
    }));
  } catch (err) {
    console.error("Resend request failed", err);
    throw new Error("Couldn't reach Resend to send the email. Try again in a moment.");
  }

  if (error) {
    console.error("Resend rejected the email", error);
    throw new Error(error.message ?? "Resend failed to send the email.");
  }

  await prisma.document.updateMany({
    where: { id: documentId, companyId },
    data: {
      sentAt: new Date(),
      status: doc.status === DocumentStatus.DRAFT ? DocumentStatus.SENT : doc.status,
    },
  });

  revalidatePath(`/editor/${documentId}`);
  revalidatePath("/invoices");
}
