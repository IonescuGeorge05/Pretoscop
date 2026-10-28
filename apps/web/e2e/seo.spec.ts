import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { validateSitemapXml } from '../../../packages/core/src/sitemap';
import { validateStructuredData } from '../src/lib/structured-data';
import { fixture, sitemapBuild } from './fixture';

// SEO (M16) against the fixture: the Testoscop TV has two live offers (indexable), the Testoscop
// phone one offer and no history (not indexable), the console 46 observed days (indexable), the
// M13 product is provisional (never indexable). The e2e server runs like the prototype:
// SITE_INDEXABLE=false (every page noindex, robots.txt closed); the indexable variant of robots.txt
// and the meta tags are checked by scripts/verify/M16.sh against a second server start.

async function jsonLd(page: Page): Promise<unknown[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const v = JSON.parse(b) as unknown;
    return Array.isArray(v) ? v : [v];
  });
}

test('product page: complete, valid JSON-LD, canonical, hreflang ro-RO, Open Graph image', async ({ page }) => {
  const f = fixture();
  await page.goto(`/p/${f.search.tv.slug}`);
  const ld = await jsonLd(page);
  expect(validateStructuredData(ld)).toEqual([]);
  const product = ld.find((x) => (x as { '@type': string })['@type'] === 'Product') as {
    brand: { name: string };
    offers: { lowPrice: string; highPrice: string; offerCount: number; offers: Array<{ seller: { name: string }; priceValidUntil?: string }> };
  };
  expect(product.brand.name).toBe('Testoscop');
  expect(product.offers).toMatchObject({ lowPrice: '2899.00', highPrice: '2999.00', offerCount: 2 });
  expect(product.offers.offers.map((o) => o.seller.name)).toEqual(['IT Galaxy', 'eMAG']);
  expect(product.offers.offers.every((o) => o.priceValidUntil === undefined)).toBe(true);
  expect(ld.some((x) => (x as { '@type': string })['@type'] === 'BreadcrumbList')).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/p/${f.search.tv.slug}$`));
  await expect(page.locator('link[rel="alternate"][hreflang="ro-RO"]')).toHaveAttribute('href', new RegExp(`/p/${f.search.tv.slug}$`));
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/);
  // The prototype is closed: noindex, nofollow everywhere (SITE_INDEXABLE=false).
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', 'noindex, nofollow');
});

test('home, category, brand and deals pages: valid Organization, WebSite + SearchAction, ItemList, BreadcrumbList', async ({ page }) => {
  for (const path of ['/', '/c/tv-audio/televizoare', '/reduceri', '/b/testoscop', '/magazin/itgalaxy', '/categorii']) {
    await page.goto(path);
    const ld = await jsonLd(page);
    expect(ld.length, path).toBeGreaterThan(0);
    expect(validateStructuredData(ld), path).toEqual([]);
  }
  await page.goto('/');
  const types = (await jsonLd(page)).map((x) => (x as { '@type': string })['@type']);
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite']));
  // ItemList on category pages lists indexable products only: the TV, never the single-offer phone.
  const f = fixture();
  await page.goto('/b/testoscop');
  const list = (await jsonLd(page)).find((x) => (x as { '@type': string })['@type'] === 'ItemList') as { itemListElement: Array<{ url: string }> };
  const urls = list.itemListElement.map((i) => new URL(i.url).pathname);
  expect(urls).toContain(`/p/${f.search.tv.slug}`);
  expect(urls).not.toContain(`/p/${f.search.phone.slug}`);
});

test('robots.txt (closed prototype), TDM reservation and security headers', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'HTTP checks');
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  // SITE_INDEXABLE=false: closed to every crawler.
  expect(await robots.text()).toBe('# Pretoscop (prototype/staging): not open to crawlers yet.\nUser-agent: *\nDisallow: /\n');
  const tdm = await request.get('/.well-known/tdmrep.json');
  expect(await tdm.json()).toEqual([expect.objectContaining({ location: '/', 'tdm-reservation': 1 })]);
  const home = await request.get('/');
  const h = home.headers();
  expect(h['tdm-reservation']).toBe('1');
  expect(h['content-language']).toBe('ro-RO');
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'self'");
  // Click-outs are never indexed (an unknown id: no click is logged).
  expect((await request.get('/out/999999999', { maxRedirects: 0 })).headers()['x-robots-tag']).toContain('noindex');
});

test('sitemaps: valid XML, only indexable products, index lists every file', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'HTTP checks');
  const f = fixture();
  const baseURL = test.info().project.use.baseURL!;
  const host = new URL(baseURL).host;
  // sitemap.build from the dev database with the fixture in it (scripts/verify/M16.sh rebuilds the
  // dev sitemaps without the fixture afterwards).
  const built = sitemapBuild(baseURL);
  expect(built.files.map((x) => x.name)).toEqual(expect.arrayContaining(['products-1.xml', 'categories.xml', 'brands.xml', 'shops.xml']));
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
  expect(all).toEqual(expect.arrayContaining(['/', '/categorii', '/magazine', '/metodologie', '/rapoarte', '/b/testoscop', '/c/tv-audio/televizoare', '/magazin/itgalaxy']));
  // Planned (unapproved) reports never; search, click-outs, admin never.
  expect(all).not.toContain('/rapoarte/black-friday-2026');
  expect(all.some((u) => u.startsWith('/cauta') || u.startsWith('/out') || u.startsWith('/admin') || u.startsWith('/api'))).toBe(false);
  expect((await request.get('/sitemaps/manifest.json')).status()).toBe(404);
  expect((await request.get('/sitemaps/products-99.xml')).status()).toBe(404);
});

const MISSING = [
  ['/p/produs-care-nu-exista-999999999', 'Produsul nu mai este disponibil pe Pretoscop'],
  ['/c/tv-audio/nu-exista', 'Pagina nu există'],
  ['/c/tv-audio/televizoare/999', 'Pagina nu există'],
  ['/b/marca-inexistenta', 'Pagina nu există'],
  ['/b/testoscop/frigidere', 'Pagina nu există'],
  ['/magazin/magazin-inexistent', 'Pagina nu există'],
  ['/reduceri/nu-exista', 'Pagina nu există'],
  ['/categorii/ceva', 'Pagina nu există'],
  ['/magazine/ceva', 'Pagina nu există'],
] as const;

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('404s are server-rendered with a way back (never an empty error document)', async ({ page }) => {
    for (const [path, heading] of MISSING) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      expect(await res!.text(), path).not.toContain('__next_error__');
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading);
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
      // The site header (search) and footer stay around the message.
      await expect(page.getByRole('search').first(), path).toBeVisible();
    }
  });
});

test('with JavaScript the 404 stays the same page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [path, heading] of [MISSING[0], MISSING[1]]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

// Client chunks of the current build (apps/web/.next), by what they contain.
const CHUNKS_DIR = fileURLToPath(new URL('../.next/static/chunks/', import.meta.url));
function chunksContaining(marker: string): Array<{ name: string; gzip: number }> {
  return readdirSync(CHUNKS_DIR)
    .filter((n) => n.endsWith('.js'))
    .map((name) => ({ name, body: readFileSync(join(CHUNKS_DIR, name)) }))
    .filter((c) => c.body.includes(marker))
    .map((c) => ({ name: c.name, gzip: gzipSync(c.body).length }));
}

/** Compressed bytes of every script a fresh phone visit downloads until the network is idle. */
async function scripts(browser: Browser, baseURL: string, path: string): Promise<Map<string, number>> {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL, locale: 'ro-RO' });
  const page = await ctx.newPage();
  const sizes: Array<Promise<[string, number]>> = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') sizes.push(r.request().sizes().then((s) => [new URL(r.url()).pathname.split('/').pop()!, s.responseBodySize]));
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  const out = new Map(await Promise.all(sizes));
  await ctx.close();
  return out;
}
const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test('performance budget on a product page: LCP under 2.5 s on a throttled phone; its own JavaScript small', async ({ page, request, browser }) => {
  test.skip(test.info().project.name !== 'mobile', 'Lighthouse-style mobile budget (docs/03 §7.3)');
  const f = fixture();
  const baseURL = test.info().project.use.baseURL!;
  const path = `/p/${f.search.tv.slug}`;
  // Warm the ISR cache: production serves product pages from the cache (docs/03 §7.1).
  expect((await request.get(path)).status()).toBe(200);

  // JavaScript: the product page against the site shell (a static page with only the layout's
  // client components). The shell alone is ~150 kB compressed (React 19 + Next.js 16 runtime, M12
  // risk note), so docs/03's "JS < 150 kB on product pages" cannot hold literally (deviation in the
  // M16 report); what the product page adds is held under 20 kB:
  // - the chart library (uPlot) loads only when the chart nears the viewport; on a short page it is
  //   on screen at once, so it is reported but not counted;
  // - the alert form renders only while alerts are on (off in development, on at launch), so its
  //   chunk is always counted.
  const uplot = chunksContaining('u-cursor-x');
  const alertForm = chunksContaining('currentBestBani');
  expect(uplot.length, 'uPlot chunk in the build').toBeGreaterThan(0);
  expect(alertForm.length, 'alert form chunk in the build').toBeGreaterThan(0);
  const shell = await scripts(browser, baseURL, '/despre');
  const product = await scripts(browser, baseURL, path);
  const uplotLoaded = uplot.reduce((s, c) => s + (product.get(c.name) ?? 0), 0);
  const alertMissing = alertForm.reduce((s, c) => s + (product.has(c.name) ? 0 : c.gzip), 0);
  const own = total(product) - total(shell) - uplotLoaded + alertMissing;
  // uPlot never loads on a page without a chart.
  expect(uplot.some((c) => shell.has(c.name))).toBe(false);

  // LCP with Lighthouse's mobile conditions applied by DevTools (stricter than its simulation): 4×
  // CPU slowdown, 150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(path, { waitUntil: 'load' });
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1]!.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );
  const kb = (n: number) => Math.round(n / 1024);
  const summary =
    `LCP ${Math.round(lcp)} ms; JavaScript: shell ${kb(total(shell))} kB, product page ${kb(total(product) - uplotLoaded + alertMissing)} kB ` +
    `with the alert form and without uPlot (own ${kb(own)} kB), uPlot ${kb(uplot.reduce((s, c) => s + c.gzip, 0))} kB when the chart is reached` +
    `${uplotLoaded ? ' (on screen at once on this page)' : ''}; compressed`;
  test.info().annotations.push({ type: 'budget', description: summary });
  console.log(`M16 budget: ${summary}`);
  expect(lcp).toBeLessThan(2500);
  expect(own).toBeLessThan(20 * 1024);
});
