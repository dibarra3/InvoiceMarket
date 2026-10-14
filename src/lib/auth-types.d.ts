import "next-auth";

/** OWNER / FIELD_CREW are business `User` rows (always with a companyId); CUSTOMER is a
 * `Customer` row, which never has a company. */
export type AccountRole = "OWNER" | "FIELD_CREW" | "CUSTOMER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string | null;
      role: AccountRole;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    companyId: string | null;
    role: AccountRole;
  }
}
