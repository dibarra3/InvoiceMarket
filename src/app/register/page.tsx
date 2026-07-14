import Link from "next/link";
import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">Create your company</h1>
      <p className="mb-6 text-sm text-slate-500">
        Sets up a fresh Groundwork account with a starter price list — invite teammates later.
      </p>

      <RegisterForm />

      <p className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-emerald-400 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
