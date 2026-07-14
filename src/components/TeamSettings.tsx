"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteTeamMember, removeTeamMember } from "@/lib/team-actions";
import type { TeamMemberRecord } from "@/lib/team-actions";

async function submitInvite(_prevState: string | null, formData: FormData): Promise<string | null> {
  try {
    await inviteTeamMember(formData);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Something went wrong.";
  }
}

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60";
const labelClass = "text-xs text-slate-500";

export function TeamSettings({ members }: { members: TeamMemberRecord[] }) {
  const [error, formAction, isPending] = useActionState(submitInvite, null);
  const [, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function handleRemove(id: string) {
    if (!confirm("Remove this teammate's access?")) return;
    setRemovingId(id);
    setRemoveError(null);
    startTransition(() => {
      removeTeamMember(id)
        .catch((err) => setRemoveError(err instanceof Error ? err.message : "Couldn't remove teammate."))
        .finally(() => setRemovingId(null));
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <h2 className="mb-1 font-display text-base font-semibold text-white">Team</h2>
      <p className="mb-4 text-xs text-slate-500">
        Owners have full access. Field Crew can create and edit draft jobs but can&apos;t reach
        billing, Stripe, or send/delete invoices.
      </p>

      {removeError && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {removeError}
        </p>
      )}

      <ul className="mb-4 flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm"
          >
            <div>
              <div className="text-slate-100">{m.email}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {m.role === "OWNER" ? "Owner" : "Field Crew"}
                {m.isSelf ? " · you" : ""}
              </div>
            </div>
            {!m.isSelf && (
              <button
                type="button"
                onClick={() => handleRemove(m.id)}
                disabled={removingId === m.id}
                className="text-xs font-semibold text-red-400 disabled:opacity-50"
              >
                {removingId === m.id ? "Removing…" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form action={formAction} className="flex flex-col gap-3 border-t border-white/10 pt-4">
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className={labelClass}>Email</span>
            <input type="email" name="email" required className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Password</span>
            <input type="password" name="password" required minLength={8} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Role</span>
            <select name="role" defaultValue="FIELD_CREW" className={inputClass}>
              <option value="FIELD_CREW">Field Crew</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-70"
        >
          {isPending ? "Inviting…" : "Invite Teammate"}
        </button>
      </form>
    </div>
  );
}
