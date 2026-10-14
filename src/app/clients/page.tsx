import { listClients } from "@/lib/actions";
import { initials, money } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { listPortalAccessForCompany } from "@/lib/customer-portal";
import { ClientPortalAccess } from "@/components/ClientPortalAccess";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [{ companyId, role }, clients] = await Promise.all([requireSession(), listClients()]);
  const isOwner = role === "OWNER";
  const portalAccess = isOwner ? await listPortalAccessForCompany(companyId) : {};

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <h2 className="mb-4 font-display text-xl font-bold text-white">Clients</h2>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-10 text-center text-sm text-slate-500">
          No clients yet. Clients are created automatically the first time you save a job with a
          client name in the Editor.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {clients.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-card p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500 font-display font-bold text-ink">
                  {initials(c.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{c.name}</div>
                  <div className="truncate text-xs text-slate-500">{c.address || "No address on file"}</div>
                </div>
              </div>
              <div className="flex justify-between border-t border-white/[0.08] pt-3 text-[13px] text-slate-400">
                <span>
                  {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                </span>
                <span className="font-mono text-emerald-400">{money(c.lifetime)}</span>
              </div>
              {isOwner && <ClientPortalAccess clientId={c.id} access={portalAccess[c.id]} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
