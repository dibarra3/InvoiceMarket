import { CustomerInvoicePage } from "@/components/CustomerInvoicePage";

export const dynamic = "force-dynamic";

/** Stripe's success redirect. Display only — the signed webhook is what marks an invoice paid. */
export default async function CustomerPaymentSuccessRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerInvoicePage id={id} result="success" />;
}
