import type { NextAuthConfig } from "next-auth";
import type { AccountRole } from "@/lib/auth-types";

/** Subset of the Auth.js config with no providers and no Prisma import, shared with
 * `proxy.ts` so it can read the session without loading the Prisma client. */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { companyId: string | null; role: AccountRole };
        token.companyId = u.companyId ?? null;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.companyId = (token.companyId as string | null | undefined) ?? null;
        session.user.role = token.role as AccountRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
