"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrintButton } from "./PrintButton";
import { signOutAction } from "@/lib/auth-actions";

const TABS = [
  { href: "/editor", label: "Editor", match: (p: string) => p.startsWith("/editor"), ownerOnly: false },
  { href: "/invoices", label: "Invoices", match: (p: string) => p.startsWith("/invoices"), ownerOnly: false },
  { href: "/clients", label: "Clients", match: (p: string) => p.startsWith("/clients"), ownerOnly: false },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings"), ownerOnly: true },
];

export function TopNav({
  authenticated,
  isOwner,
}: {
  authenticated: boolean;
  isOwner: boolean;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M4 20 L4 10 L12 4 L20 10 L20 20 Z" strokeLinejoin="round" />
                <path d="M9 20 V13 H15 V20" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-white">GROUNDWORK</h1>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">field notes — invoices, instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {authenticated && (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Sign out
                </button>
              </form>
            )}
            <PrintButton />
          </div>
        </div>
      </header>

      {authenticated && (
        <nav className="mx-auto flex max-w-6xl gap-1 px-6 pt-4">
          {TABS.filter((tab) => !tab.ownerOnly || isOwner).map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  active
                    ? "rounded-t-lg border-b-2 border-emerald-500 bg-card px-4 py-2 font-display text-[13px] font-semibold text-emerald-400"
                    : "rounded-t-lg border-b-2 border-transparent px-4 py-2 font-display text-[13px] font-semibold text-slate-500 hover:text-slate-300"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
