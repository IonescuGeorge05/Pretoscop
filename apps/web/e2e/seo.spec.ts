import { expect, test, type Page } from '@playwright/test';
import { validateSitemapXml } from '../../../packages/core/src/sitemap';
import { validateStructuredData } from '../src/lib/structured-data';
import { fixture } from './fixture';

// SEO (M16) against the fixture: the Testoscop TV has two live offers (indexable), the Testoscop phone
// one offer and no history (not indexable), the M13 product is provisional (never indexable).

async function jsonLd(page: Page): Promise<unknown[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const v = JSON.parse(b) as unknown;
    return Array.isArray(v) ? v : [v];
  });
}

test('product page: complete, valid JSON-LD, canonical and hreflang ro-RO', async ({ page }) => {
  const f = fixture();
  await page.goto(`/p/${f.search.tv.slug}`);
  const ld = await jsonLd(page);
  expect(validateStructuredData(ld)).toEqual([]);
  const product = ld.find((x) => (x as { '@type': string })['@type'] === 'Product') as { brand: { name: string }; offers: { lowPrice: string; highPrice: string; offerCount: number; offers: Array<{ seller: { name: string } }> } };
  expect(product.brand.name).toBe('Testoscop');
  expect(product.offers).toMatchObject({ lowPrice: '2899.00', highPrice: '2999.00', offerCount: 2 });
  expect(product.offers.offers.map((o) => o.seller.name)).toEqual(['IT Galaxy', 'eMAG']);
  expect(ld.some((x) => (x as { '@type': string })['@type'] === 'BreadcrumbList')).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/p/${f.search.tv.slug}$`));
  await expect(page.locator('link[rel="alternate"][hreflang="ro-RO"]')).toHaveAttribute('href', new RegExp(`/p/${f.search.tv.slug}$`));
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/);
});

test('home, category and deals pages: valid Organization, WebSite + SearchAction, ItemList, BreadcrumbList', async ({ page }) => {
  for (const path of ['/', '/c/tv-audio/televizoare', '/reduceri', '/b/testoscop']) {
    await page.goto(path);
    const ld = await jsonLd(page);
    expect(ld.length, path).toBeGreaterThan(0);
    expect(validateStructuredData(ld), path).toEqual([]);
  }
  await page.goto('/');
  const types = (await jsonLd(page)).map((x) => (x as { '@type': string })['@type']);
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite']));
});

test('robots.txt, TDM reservation and security headers', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'HTTP checks');
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  const txt = await robots.text();
  // The prototype runs with SITE_INDEXABLE=false: closed to every crawler.
  expect(txt).toContain('Disallow: /');
  const tdm = await request.get('/.well-known/tdmrep.json');
  expect(await tdm.json()).toEqual([expect.objectContaining({ location: '/', 'tdm-reservation': 1 })]);
  const home = await request.get('/');
  const h = home.headers();
  expect(h['tdm-reservation']).toBe('1');
  expect(h['content-language']).toBe('ro-RO');
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'self'");
});

test('sitemaps: valid XML, only indexable products, index lists every file', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'HTTP checks');
  const f = fixture();
  const host = new URL(test.info().project.use.baseURL!).host;
  const index = await (await request.get('/sitemap.xml')).text();
  expect(validateSitemapXml(index, { host })).toEqual([]);
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(files).toEqual(expect.arrayContaining(['/sitemaps/pages.xml', '/sitemaps/products-1.xml', '/sitemaps/categories.xml', '/sitemaps/brands.xml', '/sitemaps/shops.xml']));
  const all: string[] = [];
  for (const file of files) {
    const res = await request.get(file);
    expect(res.status(), file).toBe(200);
    const xml = await res.text();
    expect(validateSitemapXml(xml, { host }), file).toEqual([]);
    all.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname));
  }
  expect(all).toContain(`/p/${f.search.tv.slug}`);
  expect(all).toContain(`/p/${f.search.deal.slug}`);
  expect(all).not.toContain(`/p/${f.search.phone.slug}`); // one offer, no history
  expect(all).not.toContain(`/p/${f.slug}`); // provisional
  expect(all).toEqual(expect.arrayContaining(['/', '/metodologie', '/b/testoscop', '/c/tv-audio/televizoare', '/magazin/itgalaxy']));
  expect(all.some((u) => u.startsWith('/cauta') || u.startsWith('/out') || u.startsWith('/admin'))).toBe(false);
  expect((await request.get('/sitemaps/manifest.json')).status()).toBe(404);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('404s are server-rendered with a way back', async ({ page }) => {
    const missing = await page.goto('/p/produs-care-nu-exista-999999999');
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Produsul nu mai este disponibil pe Pretoscop');
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    const cat = await page.goto('/c/tv-audio/nu-exista');
    expect(cat?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
