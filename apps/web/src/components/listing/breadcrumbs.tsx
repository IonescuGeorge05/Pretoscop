import Link from 'next/link';

export interface Crumb {
  name: string;
  href: string;
}

/** Visible breadcrumb trail; the first crumb is always the home page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Navigare ierarhică" className="mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-ink-soft">
                {c.name}
              </span>
            ) : (
              <Link href={c.href} className="hover:text-brand-700">
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
