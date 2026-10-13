import type { Metadata } from "next";
import Link from "next/link";
import { GuestLookupForm } from "@/components/GuestLookupForm";

export const metadata: Metadata = { title: "Pay an invoice — Groundwork" };

export default function PayPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">Pay an invoice</h1>
      <p className="mb-6 text-sm text-slate-500">
        No account needed. Enter the invoice number and access code your contractor sent you.
      </p>

      <GuestLookupForm />

      <p className="mt-4 text-center text-xs text-slate-500">
        Have a customer account?{" "}
        <Link href="/customer/login" className="text-emerald-400 underline">
          Sign in to see all your invoices
        </Link>
      </p>
    </main>
  );
}
