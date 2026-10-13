import { CustomerInvoicePage } from "@/components/CustomerInvoicePage";

export const dynamic = "force-dynamic";

export default async function CustomerPaymentCanceledRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerInvoicePage id={id} result="canceled" />;
}
