/**
 * schema.org builders (docs/03 §7.3). Pure functions: every URL is made absolute from `base`
 * (PUBLIC_BASE_URL), so the output can be unit-tested and validated.
 */

export function absoluteUrl(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export function breadcrumbList(base: string, items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(base, c.href) })),
  };
}

/**
 * Summary-page ItemList (category, brand pages): one ListItem per product URL, positions continuing
 * across pages. Only indexable product pages belong in it.
 */
export function itemList(base: string, name: string, hrefs: string[], startPosition = 1) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: hrefs.length,
    itemListElement: hrefs.map((href, i) => ({ '@type': 'ListItem', position: startPosition + i, url: absoluteUrl(base, href) })),
  };
}
