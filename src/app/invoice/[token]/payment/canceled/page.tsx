import { GuestInvoicePage } from "@/components/GuestInvoicePage";

export const dynamic = "force-dynamic";

export default async function GuestPaymentCanceledRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestInvoicePage token={token} result="canceled" />;
}
