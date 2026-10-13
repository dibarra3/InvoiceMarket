import { notFound } from "next/navigation";
import { CustomerInvoiceView } from "@/components/CustomerInvoiceView";
import { findGuestInvoiceByToken } from "@/lib/guest-access";
import { startGuestCheckout } from "@/lib/guest-actions";

/** Guest invoice page body: the unguessable token in the URL is the only credential. */
export async function GuestInvoicePage({ token, result }: { token: string; result?: "success" | "canceled" }) {
  const invoice = await findGuestInvoiceByToken(token);
  if (!invoice) notFound();

  return (
    <CustomerInvoiceView
      invoice={invoice}
      payAction={startGuestCheckout.bind(null, token)}
      pdfHref={`/invoice/${token}/pdf`}
      backLink={result ? { href: `/invoice/${token}`, label: "Back to invoice" } : undefined}
      result={result}
    />
  );
}
