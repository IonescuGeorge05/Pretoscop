import type { LegalDocumentVersion } from '@pretoscop/config/legal-texts';
import { Scale } from 'lucide-react';
import type { ReactNode } from 'react';
import { Container } from '@/components/ui/container';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/legal';
import { Prose, Section } from './prose';

export interface LegalSection {
  /** Anchor, e.g. "drepturi" → /confidentialitate#drepturi. */
  id: string;
  title: string;
  content: ReactNode;
}

/** "Ultima actualizare: 27 octombrie 2026, versiunea 0.1" and, for unreviewed legal pages, the provisional note. */
export function DocumentMeta({ doc }: { doc: LegalDocumentVersion }) {
  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-muted" data-testid="doc-meta">
        Ultima actualizare: <time dateTime={doc.updatedAt}>{formatLongDate(doc.updatedAt)}</time>, versiunea {doc.version}
      </p>
      {doc.kind === 'legal' && !doc.reviewed && (
        <p className="flex max-w-2xl items-start gap-2.5 rounded-lg bg-info-bg px-3.5 py-2.5 text-sm text-blue-950 ring-1 ring-blue-200" data-testid="provisional-note">
          <Scale className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Document provizoriu, în curs de revizuire juridică.</strong> Textul poate fi modificat înainte de lansarea
            publică a site-ului.
          </span>
        </p>
      )}
    </div>
  );
}

/** Title band shared by every legal and trust page. */
export function PageHeader({ eyebrow, title, lead, doc, children }: { eyebrow?: string; title: string; lead?: ReactNode; doc?: LegalDocumentVersion; children?: ReactNode }) {
  return (
    <div className="border-b border-line bg-gradient-to-b from-brand-50 to-white">
      <Container className="py-10 sm:py-14">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">{lead}</p>}
        {doc && <DocumentMeta doc={doc} />}
        {children}
      </Container>
    </div>
  );
}

function TocLinks({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <ol className="mt-2 space-y-1.5 text-sm">
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-ink-soft hover:text-brand-700 hover:underline">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Table of contents: collapsible on phones, sticky beside the text on large screens. */
function Toc({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <div className="lg:order-2">
      <details className="rounded-[var(--radius-card)] bg-surface px-4 py-3 ring-1 ring-line lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Cuprins</summary>
        <nav aria-label="Cuprins">
          <TocLinks sections={sections} />
        </nav>
      </details>
      <nav aria-label="Cuprins" className="sticky top-24 hidden rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line lg:block">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pe această pagină</p>
        <TocLinks sections={sections} />
      </nav>
    </div>
  );
}

/**
 * A legal or trust page: header band, optional table of contents (from 4 sections), sections with
 * anchors. Content is plain JSX (no MDX); keep it short, warm and precise.
 */
export function LegalPage({
  eyebrow,
  title,
  lead,
  doc,
  intro,
  sections,
  outro,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  doc: LegalDocumentVersion;
  intro?: ReactNode;
  sections: readonly LegalSection[];
  outro?: ReactNode;
}) {
  const withToc = sections.length >= 4;
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} doc={doc} />
      <Container className="py-10 sm:py-12">
        <div className={cn('grid gap-8', withToc && 'lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16')}>
          {withToc && <Toc sections={sections} />}
          <Prose className="min-w-0 max-w-[46rem]">
            {intro}
            <div className={cn('space-y-10', intro ? 'mt-8' : undefined)}>
              {sections.map((s) => (
                <Section key={s.id} id={s.id} title={s.title}>
                  {s.content}
                </Section>
              ))}
            </div>
            {outro}
          </Prose>
        </div>
      </Container>
    </>
  );
}
