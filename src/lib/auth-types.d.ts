import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      role: "OWNER" | "FIELD_CREW";
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    companyId: string;
    role: "OWNER" | "FIELD_CREW";
  }
}
