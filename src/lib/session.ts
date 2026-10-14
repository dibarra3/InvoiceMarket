import { auth } from "@/auth";
import { prisma } from "./prisma";
import { UserFacingError } from "./errors";

export type SessionInfo = {
  userId: string;
  companyId: string;
  role: "OWNER" | "FIELD_CREW";
};

export type CustomerSessionInfo = {
  customerId: string;
  email: string;
  name: string;
};

/** Every business Server Action and DB-backed page goes through here so a company can never
 * read or write another company's data. Customer sessions are always rejected. */
export async function requireSession(): Promise<SessionInfo> {
  const session = await auth();
  const user = session?.user;
  if (!user?.companyId || (user.role !== "OWNER" && user.role !== "FIELD_CREW")) {
    throw new UserFacingError("Please sign in again.");
  }
  return { userId: user.id, companyId: user.companyId, role: user.role };
}

export async function requireCompanyId(): Promise<string> {
  return (await requireSession()).companyId;
}

/** Throws for Field Crew accounts — use for billing, Stripe, email delivery, Settings, and
 * document deletion, which are Owner-only. */
export async function requireOwner(): Promise<string> {
  const { companyId, role } = await requireSession();
  if (role !== "OWNER") {
    throw new UserFacingError("Only the company owner can do this.");
  }
  return companyId;
}

/** For customer-portal pages and actions. Re-reads the Customer row so a deleted account's
 * still-valid JWT stops working immediately. */
export async function requireCustomer(): Promise<CustomerSessionInfo> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.role !== "CUSTOMER") throw new UserFacingError("Please sign in again.");

  const customer = await prisma.customer.findUnique({ where: { id: user.id } });
  if (!customer) throw new UserFacingError("Please sign in again.");
  return { customerId: customer.id, email: customer.email, name: customer.name };
}
