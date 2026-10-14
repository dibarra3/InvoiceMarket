import { CustomerInvoicePage } from "@/components/CustomerInvoicePage";

export const dynamic = "force-dynamic";

export default async function CustomerInvoiceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerInvoicePage id={id} />;
}
