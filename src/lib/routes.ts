/** Landing pages for each kind of signed-in account. Business users land on the invoice list
 * (not /editor, which creates a new draft on every visit). */
export const BUSINESS_HOME = "/invoices";
export const CUSTOMER_HOME = "/customer/invoices";

export function homeForRole(role: string | null | undefined): string | null {
  if (role === "OWNER" || role === "FIELD_CREW") return BUSINESS_HOME;
  if (role === "CUSTOMER") return CUSTOMER_HOME;
  return null;
}
