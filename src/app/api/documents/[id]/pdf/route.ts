import { NextRequest, NextResponse } from "next/server";
import { getCompany, getDocument } from "@/lib/actions";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const company = await getCompany();
  const pdfBuffer = await renderInvoicePdf(doc, company);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.docNumber}.pdf"`,
    },
  });
}
