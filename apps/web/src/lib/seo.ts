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

const digestOf = (err: unknown) => (err as { digest?: unknown } | null)?.digest;
const isNotFoundSignal = (err: unknown) => {
  const d = digestOf(err);
  return typeof d === 'string' && d.startsWith('NEXT_HTTP_ERROR_FALLBACK;404');
};

/**
 * Runs a page loader for `generateMetadata`, turning the 404 and redirect signals Next.js uses
 * (`notFound()`, `permanentRedirect()`) into `null`. The page component calls the same (React-cached)
 * loader and answers them itself (`pageOrNotFound`): a `notFound()` thrown while metadata streams
 * leaves the 404 body empty in the HTML, visible only after JavaScript runs.
 */
export async function forMetadata<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    const digest = digestOf(err);
    if (typeof digest === 'string' && (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest.startsWith('NEXT_REDIRECT'))) return null;
    throw err;
  }
}

/**
 * Runs a page loader in the page component: a `notFound()` becomes `null`, so the page renders its 404
 * itself inside `NotFoundResponse` (server-rendered HTML, status 404); redirects still propagate (their
 * status and Location header are all a client needs).
 */
export async function pageOrNotFound<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (isNotFoundSignal(err)) return null;
    throw err;
  }
}

/** The static Open Graph image (app/opengraph-image.tsx, rendered at build time). */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Pretoscop — prețul total real din magazinele online din România, cu istoric',
} as const;

/**
 * Open Graph for a page that sets its own title and URL. A page's `openGraph` replaces the root
 * layout's whole object (Next.js merges metadata one key deep), so site name, locale and the image
 * are repeated here; otherwise shared links of product and browse pages would have no image.
 */
export function pageOpenGraph(o: { title: string; url: string }): NonNullable<Metadata['openGraph']> {
  return { title: o.title, url: o.url, type: 'website', locale: 'ro_RO', siteName: 'Pretoscop', images: [DEFAULT_OG_IMAGE] };
}

/** Metadata of a page that will answer 404 or redirect (the page decides): never indexed. */
export function unresolvedMetadata(title = 'Pagina nu există'): Metadata {
  return { title, robots: robotsFor(false) };
}
