import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { TopNav } from "@/components/TopNav";
import { auth } from "@/auth";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Groundwork — invoices & estimates for landscaping crews",
  description:
    "Groundwork turns messy job notes into clean invoices and estimates for landscaping and excavation companies.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-slate-200 font-sans">
        <div className="flex min-h-screen flex-col">
          <TopNav authenticated={Boolean(session?.user)} isOwner={session?.user?.role === "OWNER"} />
          <div className="flex-1">{children}</div>
          <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-center font-mono text-[11px] text-slate-600">
            Groundwork persists every invoice, estimate, client, and line item to Postgres — nothing here is
            mock data.
          </footer>
        </div>
      </body>
    </html>
  );
}
