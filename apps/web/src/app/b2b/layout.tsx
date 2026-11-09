import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';

export const metadata: Metadata = {
  title: { default: 'Pretoscop pentru companii', template: '%s | Pretoscop pentru companii' },
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/** B2B price intelligence (M28): workspaces for merchants and brands, outside the public site. */
export default function B2bLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Logo />
          <Link href="/b2b" className="text-sm font-semibold text-ink-soft hover:text-brand-700">
            pentru companii
          </Link>
        </div>
      </header>
      <main id="continut" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-4 px-4 py-4 text-xs text-muted">
          <Link href="/pentru-companii/termeni" className="underline">
            Termenii pentru clienții B2B
          </Link>
          <Link href="/confidentialitate" className="underline">
            Confidențialitate
          </Link>
          <Link href="/contact" className="underline">
            Contact
          </Link>
          <span>Prețuri observate de Pretoscop, cu TVA. Fără date personale ale cumpărătorilor și fără conținut Open Icecat.</span>
        </div>
      </footer>
    </div>
  );
}
