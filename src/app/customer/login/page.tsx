import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CustomerAuthForm } from "@/components/CustomerAuthForm";
import { homeForRole } from "@/lib/routes";

export const metadata: Metadata = { title: "Customer sign in — Groundwork" };

export default async function CustomerLoginPage() {
  const home = homeForRole((await auth())?.user?.role);
  if (home) redirect(home);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">Customer sign in</h1>
      <p className="mb-6 text-sm text-slate-500">See and pay the invoices your contractors have sent you.</p>

      <CustomerAuthForm mode="login" />

      <p className="mt-4 text-center text-xs text-slate-500">
        New here?{" "}
        <Link href="/customer/register" className="text-emerald-400 underline">
          Create a customer account
        </Link>
        {" · "}
        <Link href="/pay" className="text-emerald-400 underline">
          Pay without an account
        </Link>
      </p>
    </main>
  );
}
