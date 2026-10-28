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
