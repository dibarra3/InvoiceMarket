import type { NextAuthConfig } from "next-auth";

/** Edge-safe subset of the Auth.js config (no providers, no Prisma import) — used by
 * `middleware.ts`, which runs on the Edge runtime and can't load the Node Prisma client. */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { companyId: string; role: "OWNER" | "FIELD_CREW" };
        token.companyId = u.companyId;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.companyId = token.companyId as string;
        session.user.role = token.role as "OWNER" | "FIELD_CREW";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
