import { notFound } from "next/navigation";
import { CustomerInvoiceView } from "@/components/CustomerInvoiceView";
import { customerOrRedirect } from "@/lib/customer-page";
import { getCustomerInvoice } from "@/lib/customer-portal";
import { startCustomerCheckout } from "@/lib/customer-actions";
import { CUSTOMER_HOME } from "@/lib/routes";

/** Customer-portal invoice page body; 404s for anything the customer isn't linked to. */
export async function CustomerInvoicePage({ id, result }: { id: string; result?: "success" | "canceled" }) {
  const customer = await customerOrRedirect();
  const invoice = await getCustomerInvoice(customer.customerId, id);
  if (!invoice) notFound();

  return (
    <CustomerInvoiceView
      invoice={invoice}
      payAction={startCustomerCheckout.bind(null, id)}
      pdfHref={`/customer/invoices/${id}/pdf`}
      backLink={
        result
          ? { href: `/customer/invoices/${id}`, label: "Back to invoice" }
          : { href: CUSTOMER_HOME, label: "My invoices" }
      }
      result={result}
    />
  );
}
