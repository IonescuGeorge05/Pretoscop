import Link from 'next/link';
import type { ReactNode } from 'react';
import { B2B_MESSAGES } from '@/lib/b2b';
import { cn } from '@/lib/cn';

/** Shared bits of the B2B workspace pages (M28). Server components. */

export const inputClass =
  'block h-10 w-full rounded-lg border border-line bg-white px-3 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
export const labelClass = 'block text-sm font-semibold text-ink';

export function Panel({ title, children, right, id }: { title: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-6 rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** The `?ok=` / `?eroare=` notice after a server action. */
export function Flash({ ok, eroare, detail }: { ok?: string; eroare?: string; detail?: string }) {
  if (!ok && !eroare) return null;
  const text = B2B_MESSAGES[(eroare ?? ok)!] ?? (eroare ? 'A apărut o eroare.' : 'Gata.');
  return (
    <p
      role={eroare ? 'alert' : 'status'}
      data-testid="b2b-flash"
      className={cn('mb-4 rounded-lg px-4 py-3 text-sm ring-1', eroare ? 'bg-high-bg text-high ring-high/30' : 'bg-good-bg text-good ring-good/30')}
    >
      {text}
      {detail ? ` ${detail}` : ''}
    </p>
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label id={`${id}-label`} htmlFor={id} className={labelClass}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function WorkspaceNav({ ws, current }: { ws: number; current: 'pozitii' | 'import' | 'api' | 'setari' }) {
  const items = [
    ['pozitii', '', 'Poziții'],
    ['import', '/import', 'Import SKU-uri'],
    ['api', '/api', 'API'],
    ['setari', '/setari', 'Setări'],
  ] as const;
  return (
    <nav aria-label="Spațiul de lucru" className="mb-5 flex flex-wrap gap-2 text-sm">
      {items.map(([key, path, label]) => (
        <Link
          key={key}
          href={`/b2b/${ws}${path}`}
          aria-current={current === key ? 'page' : undefined}
          className={cn('rounded-lg px-3 py-1.5 ring-1 ring-line', current === key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-soft hover:bg-brand-50')}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function StatBox({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-line" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular">{value}</div>
    </div>
  );
}
