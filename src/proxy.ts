import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { BUSINESS_HOME, CUSTOMER_HOME } from "@/lib/routes";

/** Pages anyone can open. Guest invoice pages are protected by their unguessable token. */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/customer/login",
  "/customer/register",
  "/pay",
  "/invoice",
  "/api/auth",
  "/api/stripe/webhook",
];

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

const { auth } = NextAuth(authConfig);

/** Routes each area to the right kind of account. This is a UX layer only — every page,
 * Server Action, and route handler re-checks authorization on the server. */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC_PATHS.some((p) => matches(pathname, p))) return NextResponse.next();

  const role = req.auth?.user?.role;
  const isApi = pathname.startsWith("/api");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));

  if (matches(pathname, "/customer")) {
    if (role === "CUSTOMER") return NextResponse.next();
    if (role === "OWNER" || role === "FIELD_CREW") return redirectTo(BUSINESS_HOME);
    return redirectTo("/customer/login");
  }

  // Everything else is the business app (editor, invoices, clients, settings, business APIs).
  if (role === "OWNER" || role === "FIELD_CREW") return NextResponse.next();
  if (isApi) {
    return NextResponse.json({ error: role ? "Forbidden" : "Not authenticated" }, { status: role ? 403 : 401 });
  }
  if (role === "CUSTOMER") return redirectTo(CUSTOMER_HOME);
  return redirectTo("/login");
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
