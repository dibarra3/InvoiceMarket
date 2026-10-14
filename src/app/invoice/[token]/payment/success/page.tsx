import { GuestInvoicePage } from "@/components/GuestInvoicePage";

export const dynamic = "force-dynamic";

/** Stripe's success redirect. Display only — the signed webhook is what marks an invoice paid. */
export default async function GuestPaymentSuccessRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestInvoicePage token={token} result="success" />;
}
