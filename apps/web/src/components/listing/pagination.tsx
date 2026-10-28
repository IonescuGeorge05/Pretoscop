import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Numbered pages around the current one, first and last always shown. */
export function pageWindow(page: number, total: number, around = 1): Array<number | 'gap'> {
  const set = new Set<number>([1, total]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= total) set.add(p);
  const sorted = [...set].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** Plain links (no JavaScript); `href(n)` builds the URL of page n. */
export function Pagination({ page, totalPages, href, rel }: { page: number; totalPages: number; href: (n: number) => string; rel?: string }) {
  if (totalPages <= 1) return null;
  const link = 'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm ring-1 ring-line hover:bg-brand-50';
  return (
    <nav aria-label="Paginare" className="mt-6 flex flex-wrap items-center justify-center gap-1.5" data-testid="pagination">
      {page > 1 && (
        <a href={href(page - 1)} rel={['prev', rel].filter(Boolean).join(' ')} className={link}>
          <ChevronLeft className="size-4" aria-hidden /> <span>Înapoi</span>
        </a>
      )}
      {pageWindow(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
            …
          </span>
        ) : (
          <a key={p} href={href(p)} rel={rel} aria-current={p === page ? 'page' : undefined} className={cn(link, p === page && 'bg-brand-600 text-white ring-brand-600 hover:bg-brand-700')}>
            <span className="sr-only">Pagina </span>
            {p}
          </a>
        ),
      )}
      {page < totalPages && (
        <a href={href(page + 1)} rel={['next', rel].filter(Boolean).join(' ')} className={link}>
          <span>Înainte</span> <ChevronRight className="size-4" aria-hidden />
        </a>
      )}
    </nav>
  );
}
