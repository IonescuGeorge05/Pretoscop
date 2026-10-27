import Link from 'next/link';

/** Wordmark with a small "price lens" mark (inline SVG, no image request). */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Pretoscop, prima pagină">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="14" cy="14" r="10" fill="none" stroke="var(--color-brand-600)" strokeWidth="3" />
        <path d="M8 17 L12 13 L15 15.5 L20 10" fill="none" stroke="var(--color-good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21.5 21.5 L28 28" stroke="var(--color-brand-600)" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        Preto<span className="text-brand-600">scop</span>
      </span>
    </Link>
  );
}
