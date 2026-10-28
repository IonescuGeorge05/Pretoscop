import 'server-only';
import type { Metadata } from 'next';
import { serverEnv } from './db';

/**
 * Robots meta for a page (docs/03 §6.6). While the site is not indexable (`SITE_INDEXABLE=false`:
 * prototype, staging) every page is noindex,nofollow; afterwards each page decides, and pages kept
 * out of the index still let crawlers follow their links.
 */
export function robotsFor(pageIndexable: boolean): NonNullable<Metadata['robots']> {
  if (!serverEnv().SITE_INDEXABLE) return { index: false, follow: false };
  return pageIndexable ? { index: true, follow: true } : { index: false, follow: true };
}

/**
 * Runs a page loader for `generateMetadata`, turning the 404 and redirect signals Next.js uses
 * (`notFound()`, `permanentRedirect()`) into `null`. The page component calls the same (React-cached)
 * loader and raises them itself: a `notFound()` thrown while metadata streams leaves the 404 body
 * empty in the HTML, visible only after JavaScript runs.
 */
export async function forMetadata<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest.startsWith('NEXT_REDIRECT'))) return null;
    throw err;
  }
}

/** Metadata of a page that will answer 404 or redirect (the page decides). */
export const UNRESOLVED: Metadata = { robots: { index: false, follow: true } };
