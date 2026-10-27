import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-line">{children}</div>
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[720px] text-left text-[13px]">
      <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-3 py-2 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">{children}</tbody>
    </table>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2 align-top', className)}>{children}</td>;
}

const HEALTH: Record<string, string> = {
  ok: 'bg-good-bg text-good',
  degraded: 'bg-usual-bg text-usual',
  failing: 'bg-high-bg text-high',
  blocked: 'bg-high-bg text-high',
  unknown: 'bg-surface text-muted',
};

export function Health({ value }: { value: string }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', HEALTH[value] ?? HEALTH.unknown)}>{value}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-line">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
