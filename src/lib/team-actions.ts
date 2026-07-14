"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireSession } from "./session";
import { Role } from "@/generated/prisma/enums";

export type TeamMemberRecord = {
  id: string;
  email: string;
  role: "OWNER" | "FIELD_CREW";
  isSelf: boolean;
};

export async function listTeamMembers(): Promise<TeamMemberRecord[]> {
  const { companyId, role, userId } = await requireSession();
  if (role !== "OWNER") throw new Error("Only the company owner can view the team.");

  const users = await prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  return users.map((u) => ({ id: u.id, email: u.email, role: u.role, isSelf: u.id === userId }));
}

export async function inviteTeamMember(formData: FormData): Promise<void> {
  const { companyId, role } = await requireSession();
  if (role !== "OWNER") throw new Error("Only the company owner can invite teammates.");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const memberRole = formData.get("role") === "OWNER" ? Role.OWNER : Role.FIELD_CREW;

  if (!email || password.length < 8) {
    throw new Error("Email and an 8+ character password are required.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists.");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash, role: memberRole, companyId } });
  revalidatePath("/settings");
}

export async function removeTeamMember(targetUserId: string): Promise<void> {
  const { companyId, role, userId } = await requireSession();
  if (role !== "OWNER") throw new Error("Only the company owner can remove teammates.");
  if (targetUserId === userId) throw new Error("You can't remove your own account.");

  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId } });
  if (!target) throw new Error("Teammate not found.");

  if (target.role === Role.OWNER) {
    const ownerCount = await prisma.user.count({ where: { companyId, role: Role.OWNER } });
    if (ownerCount <= 1) throw new Error("A company must keep at least one owner.");
  }

  await prisma.user.delete({ where: { id: targetUserId } });
  revalidatePath("/settings");
}
