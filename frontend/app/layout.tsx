import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import Link from "next/link";

import { appName } from "@/lib/format";

import "./globals.css";

// fonturile se descarcă la build și se servesc de pe site (fără cereri către Google la vizitare)
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], weight: ["600", "800"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"], variable: "--font-body" });

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

/** „pretoscop” cu „scop” în culoarea de accent. */
function Logo({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const cut = lower.endsWith("scop") ? lower.length - 4 : lower.length;
  return (
    <span className="font-display text-2xl font-extrabold tracking-tight">
      {lower.slice(0, cut)}
      <span className="text-accent">{lower.slice(cut)}</span>
    </span>
  );
}

const NAV = [
  { href: "/#ps5", label: "PS5" },
  { href: "/#iphone-18-pro", label: "iPhone 18 Pro" },
  { href: "/reduceri", label: "Reduceri reale", highlight: true },
  { href: "/despre", label: "Cum calculăm" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const name = appName();
  return (
    <html lang="ro" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label={`${name} — prima pagină`}>
            <Logo name={name} />
          </Link>
          <nav className="flex flex-wrap gap-1 text-[15px] font-medium">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-2 hover:bg-soft ${n.highlight ? "bg-warm" : ""}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div className="rounded-3xl bg-soft px-6 py-5 text-sm text-muted">
            {name} — prototip. Prețurile pot diferi de cele din magazin; verifică întotdeauna pe site-ul magazinului.
            Recomandările sunt informative, nu sfaturi financiare.
            <span className="mt-3 flex gap-5 font-medium">
              <Link href="/despre" className="underline hover:text-ink">
                Cum calculăm
              </Link>
              <Link href="/confidentialitate" className="underline hover:text-ink">
                Confidențialitate
              </Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
