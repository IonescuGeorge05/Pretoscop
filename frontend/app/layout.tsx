import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { appName } from "@/lib/format";

import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const name = appName();
  return {
    title: { default: `${name} — prețuri reale PlayStation 5`, template: `%s | ${name}` },
    description:
      "Compară prețurile PlayStation 5 din toate magazinele din România: preț final real (cu transport și garanție), istoric și recomandări.",
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const name = appName();
  return (
    <html lang="ro">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line bg-card">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              {name}
            </Link>
            <div className="flex gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-ink">
                Modele PS5
              </Link>
              <Link href="/despre" className="hover:text-ink">
                Metodologie
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 pt-4 text-xs text-muted">
          {name} — prototip. Prețurile pot diferi de cele din magazin; verifică întotdeauna pe site-ul magazinului.
          Recomandările sunt informative, nu sfaturi financiare.
        </footer>
      </body>
    </html>
  );
}
