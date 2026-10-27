import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Long-form typography for the legal and trust pages (no typography plugin: the rules live here).
 * Headings, paragraphs, lists, links, inline code; tables, callouts and code blocks are components.
 */
const PROSE = cn(
  'text-[15px] leading-relaxed text-ink-soft sm:text-base',
  '[&_p]:my-3',
  '[&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink sm:[&_h2]:text-2xl',
  '[&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink sm:[&_h3]:text-lg',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
  '[&_li]:pl-1 [&_li]:marker:text-muted',
  '[&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_a]:decoration-brand-300 [&_a]:underline-offset-2 [&_a:hover]:decoration-brand-700',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] [&_:not(pre)>code]:break-words [&_:not(pre)>code]:text-ink [&_:not(pre)>code]:ring-1 [&_:not(pre)>code]:ring-line',
);

export function Prose({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(PROSE, className)} {...props} />;
}

/** A titled section with an anchor (the table of contents links to `#id`). */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titlu`} className="scroll-mt-36 border-t border-line pt-8 first:border-t-0 first:pt-0 md:scroll-mt-24">
      <h2 id={`${id}-titlu`}>{title}</h2>
      {children}
    </section>
  );
}

const TONES = {
  brand: 'bg-brand-50 text-brand-900 ring-brand-200',
  info: 'bg-info-bg text-blue-950 ring-blue-200',
  neutral: 'bg-surface text-ink-soft ring-line',
} as const;

/** Highlighted box: summaries, commitments, notes. */
export function Callout({ title, tone = 'brand', icon, children, className, ...rest }: { title?: string; tone?: keyof typeof TONES; icon?: ReactNode; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={cn('my-5 flex gap-3 rounded-[var(--radius-card)] p-4 ring-1 sm:p-5', TONES[tone], className)} {...rest}>
      {icon && <div className="mt-0.5 shrink-0 [&>svg]:size-5">{icon}</div>}
      <div className="min-w-0 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul:last-child]:mb-0">
        {title && <p className="font-semibold text-current">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * Accessible data table that scrolls horizontally inside its frame on narrow screens (the page
 * itself never scrolls sideways). The first cell of each row is a row header by default.
 */
export function DataTable({
  caption,
  head,
  rows,
  rowHeader = true,
  tableClassName,
}: {
  caption: string;
  head: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
  rowHeader?: boolean;
  /** e.g. "min-w-[40rem]" for wide tables. */
  tableClassName?: string;
}) {
  return (
    <div className="my-5 max-w-full overflow-x-auto rounded-[var(--radius-card)] bg-canvas ring-1 ring-line">
      <table className={cn('w-full border-collapse text-left text-sm leading-normal', tableClassName)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 align-bottom">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top text-ink-soft [&_p]:my-0 [&_ul]:my-0">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) =>
                j === 0 && rowHeader ? (
                  <th key={j} scope="row" className="px-3 py-3 font-semibold text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-3">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A titled card with term/description pairs (e.g. one processing activity: data, purpose, legal
 * basis, retention). Stacks on phones, two columns from `sm`. `id` makes it linkable.
 */
export function InfoCard({ id, title, items }: { id?: string; title: string; items: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <div id={id} className="my-4 scroll-mt-36 rounded-[var(--radius-card)] bg-canvas p-4 ring-1 ring-line md:scroll-mt-24 sm:p-5">
      <h3 className="mt-0!">{title}</h3>
      <dl className="grid gap-x-5 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-y-2.5">
        {items.map(([term, description]) => (
          <div key={term} className="contents">
            <dt className="mt-2 text-sm font-semibold text-ink sm:mt-0">{term}</dt>
            <dd className="text-[15px] [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Pre-formatted snippet (robots.txt rules, User-Agent strings); long lines wrap instead of scrolling. */
export function CodeBlock({ label, children }: { label?: string; children: string }) {
  return (
    <figure className="my-5">
      {label && <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</figcaption>}
      <pre className="whitespace-pre-wrap break-words rounded-[var(--radius-card)] bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-slate-100">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
