import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';

const nav = [
  ['/admin', 'Panou'],
  ['/admin/surse', 'Surse'],
  ['/admin/rulari', 'Rulări'],
  ['/admin/potriviri', 'Potriviri'],
  ['/admin/produse', 'Produse'],
  ['/admin/oferte', 'Oferte'],
  ['/admin/carantina', 'Carantină'],
  ['/admin/comercianti', 'Magazine partenere'],
  ['/admin/contactari', 'Contactări'],
  ['/admin/flaguri', 'Flaguri'],
  ['/admin/audit', 'Audit'],
] as const;

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-bold">
            Pretoscop <span className="font-normal text-muted">admin</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className="text-ink-soft hover:text-brand-700">
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted">{admin.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
