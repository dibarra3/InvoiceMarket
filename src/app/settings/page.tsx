import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCompany } from "@/lib/actions";
import { listTeamMembers } from "@/lib/team-actions";
import { SettingsForm } from "@/components/SettingsForm";
import { TeamSettings } from "@/components/TeamSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "OWNER") redirect("/editor");

  const [company, members] = await Promise.all([getCompany(), listTeamMembers()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <h2 className="font-display text-xl font-bold text-white">Settings</h2>
      <SettingsForm company={company} />
      <TeamSettings members={members} />
    </main>
  );
}
