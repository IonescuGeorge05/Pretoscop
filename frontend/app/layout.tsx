import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { appName } from "@/lib/format";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const name = appName();
  return {
    // site-ul static nu e încă lansat public: nu-l indexăm (NOINDEX=0 la lansare)
    robots: process.env.NEXT_PUBLIC_NOINDEX === "1" ? { index: false, follow: false } : undefined,
    title: { default: `${name} — prețuri reale, istoric și recomandări`, template: `%s | ${name}` },
    description:
      "Compară prețurile din toate magazinele din România: preț final real (cu transport și garanție), istoric, reduceri false și recomandări.",
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
              <Link href="/#ps5" className="hover:text-ink">
                PS5
              </Link>
              <Link href="/#iphone-18-pro" className="hover:text-ink">
                iPhone 18 Pro
              </Link>
              <Link href="/reduceri" className="hover:text-ink">
                Reduceri reale
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
          <span className="mt-2 flex gap-4">
            <Link href="/despre" className="underline hover:text-ink">
              Metodologie
            </Link>
            <Link href="/confidentialitate" className="underline hover:text-ink">
              Confidențialitate
            </Link>
          </span>
        </footer>
      </body>
    </html>
  );
}
