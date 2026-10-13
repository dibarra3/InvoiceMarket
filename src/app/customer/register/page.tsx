import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CustomerAuthForm } from "@/components/CustomerAuthForm";
import { homeForRole } from "@/lib/routes";

export const metadata: Metadata = { title: "Create a customer account — Groundwork" };

export default async function CustomerRegisterPage() {
  const home = homeForRole((await auth())?.user?.role);
  if (home) redirect(home);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">Create a customer account</h1>
      <p className="mb-6 text-sm text-slate-500">
        After signing up, enter the portal code from your contractor to see your invoices. Running a business?{" "}
        <Link href="/register" className="text-emerald-400 underline">
          Create a business account instead
        </Link>
        .
      </p>

      <CustomerAuthForm mode="register" />

      <p className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/customer/login" className="text-emerald-400 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
