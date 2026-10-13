import { redirect } from "next/navigation";
import { requireCustomer, type CustomerSessionInfo } from "./session";

/** For customer-portal pages: the signed-in customer, or a redirect to customer sign-in. */
export async function customerOrRedirect(): Promise<CustomerSessionInfo> {
  const customer = await requireCustomer().catch(() => null);
  if (!customer) redirect("/customer/login");
  return customer;
}
