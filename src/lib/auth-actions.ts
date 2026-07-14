"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";

const DEFAULT_INVENTORY = [
  { key: "sod_bermuda", label: "Bermuda Sod", unit: "pallet", rate: 150, matchTerm: String.raw`pallets?\s+of\s+bermuda\s*sod` },
  { key: "sod_augustine", label: "St. Augustine Sod", unit: "pallet", rate: 175, matchTerm: String.raw`pallets?\s+of\s+st\.?\s*augustine\s*sod` },
  { key: "labor", label: "Labor", unit: "hour", rate: 75, matchTerm: String.raw`(?:hours?|hrs?)\s*(?:of\s+)?labor` },
  { key: "mulch", label: "Mulch", unit: "yard", rate: 45, matchTerm: String.raw`yards?\s+of\s+mulch` },
  { key: "topsoil", label: "Topsoil", unit: "yard", rate: 40, matchTerm: String.raw`yards?\s+of\s+topsoil` },
  { key: "paver", label: "Paver Installation", unit: "sq ft", rate: 12, matchTerm: String.raw`sq\.?\s*ft\.?\s+of\s+pavers?` },
  { key: "irrigation", label: "Irrigation Head", unit: "each", rate: 25, matchTerm: String.raw`irrigation\s*heads?` },
  { key: "mowing", label: "Mowing Service", unit: "visit", rate: 60, matchTerm: String.raw`mowing\s*(?:visits?|services?)` },
];

export async function registerCompany(formData: FormData): Promise<void> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!companyName || !email || password.length < 8) {
    throw new Error("Company name, email, and an 8+ character password are required.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists.");

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.company.create({
    data: {
      name: companyName,
      users: { create: { email, passwordHash } },
      inventoryItems: { create: DEFAULT_INVENTORY },
    },
  });

  await signIn("credentials", { email, password, redirectTo: "/editor" });
}

export async function loginWithCredentials(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/editor" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/login?error=1`);
    }
    throw err;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
