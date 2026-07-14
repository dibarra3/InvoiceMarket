import { auth } from "@/auth";

export type SessionInfo = {
  userId: string;
  companyId: string;
  role: "OWNER" | "FIELD_CREW";
};

/** Every Server Action and DB-backed page goes through here so a company can never
 * read or write another company's data. */
export async function requireSession(): Promise<SessionInfo> {
  const session = await auth();
  if (!session?.user?.companyId) throw new Error("Not authenticated");
  return { userId: session.user.id, companyId: session.user.companyId, role: session.user.role };
}

export async function requireCompanyId(): Promise<string> {
  return (await requireSession()).companyId;
}

/** Throws for Field Crew accounts — use for billing, Stripe, email delivery, Settings, and
 * document deletion, which are Owner-only. */
export async function requireOwner(): Promise<string> {
  const { companyId, role } = await requireSession();
  if (role !== "OWNER") {
    throw new Error("Only the company owner can do this.");
  }
  return companyId;
}
