import { NextRequest, NextResponse } from "next/server";
import { findGuestInvoiceByToken } from "@/lib/guest-access";
import { toPdfInputs } from "@/lib/public-invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await findGuestInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { doc, company } = toPdfInputs(invoice);
  const pdfBuffer = await renderInvoicePdf(doc, company);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.docNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
