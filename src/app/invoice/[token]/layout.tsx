import type { Metadata } from "next";

// The URL itself is the credential: keep it out of Referer headers and search indexes.
export const metadata: Metadata = {
  title: "Your invoice — Groundwork",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function GuestInvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
