import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/session";
import { getCustomerInvoice } from "@/lib/customer-portal";
import { toPdfInputs } from "@/lib/public-invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const customer = await requireCustomer().catch(() => null);
  if (!customer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const invoice = await getCustomerInvoice(customer.customerId, id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { doc, company } = toPdfInputs(invoice);
  const pdfBuffer = await renderInvoicePdf(doc, company);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.docNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
