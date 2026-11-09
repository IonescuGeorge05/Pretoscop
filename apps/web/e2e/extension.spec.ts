import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { runTsx } from './fixture';

// The browser extension (M26) end to end: the real extension, built for this server, loaded into
// Chromium; shop pages served from local files through routing (recorded eMAG pages, a synthetic
// Altex page) — nothing reaches a shop, every other request is aborted; lookups go to this server's
// GET /api/ext/lookup with the app's own headers (CSP included). The fixture (ext-create) switches
// the lookup flag on and ext-drop puts it back.
// Run alone with: E2E_SHARED_FIXTURE=0 pnpm exec playwright test e2e/extension.spec.ts --project=desktop --workers=1

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));
const EXT_DIR = fileURLToPath(new URL('../../extension', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const HOST_ID = 'pretoscop-ext-host';

interface FxProduct {
  id: number;
  slug: string;
  title: string;
  observationsDays: number;
}
interface Fx {
  tv: FxProduct & { emagUrl: string };
  young: FxProduct & { gtin: string };
  flagWas: { enabled: boolean; config: Record<string, unknown> } | null;
}

function cli<T>(cmd: string, ...args: string[]): T {
  const out = runTsx(DB_DIR, ['src/cli/e2e-fixture.ts', cmd, ...args]);
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e-fixture ${cmd}: no JSON\n${out}`);
  return JSON.parse(line) as T;
}

const file = (path: string) => readFileSync(join(REPO, path), 'utf8');
/** A recorded page without its scripts (JSON-LD kept): a static DOM, and nothing of the shop's code runs. */
const withoutScripts = (html: string) => html.replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '');

const EMAG_RECORDED = 'packages/extractors/fixtures/emag/product_2026-10-27.html';
const EMAG_CANONICAL = 'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/';

let fx: Fx;
let ctx: BrowserContext;
let extDir: string;
let base: string;
/** Shop pages this run serves (URL → HTML); every other shop request is aborted. */
const pages = new Map<string, string>();
/** Lookups the extension made (query strings), seen by the router. */
const lookups: string[] = [];

/** The eMAG product page recorded by PretoscopBot (M03), turned into the fixture TV's page. */
function emagTvPage(): string {
  return withoutScripts(file(EMAG_RECORDED))
    .split(EMAG_CANONICAL)
    .join(fx.tv.emagUrl)
    .split('DF1MLR2BM')
    .join('DE2EEXT01')
    .replace('"mpn": "SM-S741BZVDEUE"', '"mpn": "TSC-55TV9"')
    .replace(/("brand": \{\s*"@type": "Brand",\s*"name": )"Samsung"/, '$1"Testoscop"');
}

/** The synthetic Altex product page (apps/extension/fixtures) naming the fixture phone's EAN. */
function altexYoungPage(): string {
  return file('apps/extension/fixtures/altex/product_synthetic.html')
    .replace(/telefon-samsung-galaxy-a17-5g-128gb-4gb-ram-dual-sim-gray/g, 'telefon-testoscop-ext-y1-produs-de-test-e2e')
    .replace(/TELA176BGR/g, 'E2EEXTY1')
    .replace('"ean_codes":["8806097640226"]', `"ean_codes":["${fx.young.gtin}"]`);
}
const ALTEX_URL = 'https://altex.ro/telefon-testoscop-ext-y1-produs-de-test-e2e/cpd/E2EEXTY1/';

async function lightDom(page: Page): Promise<{ links: string[]; elements: number }> {
  return page.evaluate((hostId) => {
    const all = [...document.querySelectorAll('*')].filter((e) => e.id !== hostId);
    return { links: all.filter((e): e is HTMLAnchorElement => e instanceof HTMLAnchorElement).map((a) => `${a.getAttribute('href')}|${a.getAttribute('rel')}|${a.getAttribute('target')}`), elements: all.length };
  }, HOST_ID);
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.skip(({ isMobile }) => isMobile, 'one Chromium with the extension loaded: runs once, in the desktop project');

test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return;
  // The server playwright.config.ts starts (baseURL is test-scoped, not available here).
  base = `http://localhost:${Number(process.env.E2E_PORT ?? 3200)}`;
  fx = cli<Fx>('ext-create');
  extDir = mkdtempSync(join(tmpdir(), 'pretoscop-ext-e2e-'));
  runTsx(EXT_DIR, ['build.ts', '--target=chrome', `--out=${extDir}`, `--api=${base}`, `--site=${base}`]);
  pages.set(fx.tv.emagUrl, emagTvPage());
  pages.set(`${fx.tv.emagUrl}?X-Search-Id=e2e`, emagTvPage());
  pages.set(ALTEX_URL, altexYoungPage());
  pages.set('https://www.emag.ro/telefoane-mobile/c', withoutScripts(file('packages/extractors/fixtures/emag/listing_2026-10-27.html')));
  // `channel: 'chromium'` is the full browser in the new headless mode, the one that loads extensions.
  ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(`${base}/api/ext/lookup`)) {
      lookups.push(new URL(url).search);
      return route.continue();
    }
    if (url.startsWith(`${base}/`)) return route.continue();
    const html = pages.get(url);
    if (html !== undefined && route.request().resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.abort();
  });
  if (ctx.serviceWorkers().length === 0) await ctx.waitForEvent('serviceworker');
});

test.afterAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return;
  await ctx?.close();
  if (extDir) rmSync(extDir, { recursive: true, force: true });
  if (fx) cli('ext-drop', JSON.stringify(fx.flagWas));
});

test('eMAG product page (recorded markup): the panel with history, 30-day low, cheapest shop, verdict and M15 badges; no link of the shop changed', async () => {
  const page = await ctx.newPage();
  await page.goto(`${fx.tv.emagUrl}?X-Search-Id=e2e`);
  const before = await lightDom(page);
  const panel = page.locator(`#${HOST_ID}`).getByRole('region', { name: 'Pretoscop: istoricul prețului' });
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // The lookup sent the page's identifiers only: its address without the query, brand and part number.
  const sent = new URLSearchParams(lookups.at(-1)!);
  expect([...sent.keys()]).toEqual(['url', 'brand', 'mpn']);
  expect(Object.fromEntries(sent)).toEqual({ url: fx.tv.emagUrl, brand: 'Testoscop', mpn: 'TSC-55TV9' });

  await expect(panel).toContainText(fx.tv.title);
  await expect(panel).toContainText('Cel mai mic preț total acum');
  await expect(panel).toContainText('2.449,00 lei');
  await expect(panel).toContainText('la IT Galaxy · livrare gratuită');
  await expect(panel.getByRole('listitem').filter({ hasText: 'Preț bun' })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: /^−18% față de minimul din 30 de zile$/ })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: /^Minim istoric$/ })).toBeVisible();
  await expect(panel).toContainText('cu 18% sub cel mai mic preț observat de Pretoscop în cele 30 de zile dinaintea scăderii (2.999,00 lei');
  // Sparkline of observed days, described for screen readers.
  await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /^Cel mai mic preț total pe zi, 41 de zile observate între .+: între 2\.449,00 lei și 2\.999,00 lei\.$/);
  await expect(panel.getByText('Minim 30 de zile')).toBeVisible();
  await expect(panel.locator('dd').first()).toHaveText('2.449,00 lei');
  // eMAG (2.499 lei) is listed as "this shop", IT Galaxy cheaper.
  await expect(panel.getByRole('list').last()).toContainText('eMAG · acest magazin');
  // One plain link to Pretoscop: no tracking or affiliate parameters.
  const link = panel.getByRole('link', { name: 'Vezi toate ofertele și istoricul pe Pretoscop' });
  await expect(link).toHaveAttribute('href', `${base}/p/${fx.tv.slug}`);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(panel.getByRole('link')).toHaveCount(1);

  // The shop's page is untouched: same links (href, rel, target), one element added (our host).
  const after = await lightDom(page);
  expect(after).toEqual(before);
  expect(await page.evaluate((id) => document.documentElement.lastElementChild?.id === id && document.querySelectorAll(`#${id}`).length === 1, HOST_ID)).toBe(true);
  // Shadow DOM: the page's CSS cannot reach the panel, ours does not leak out.
  expect(await page.evaluate((id) => !!document.getElementById(id)?.shadowRoot, HOST_ID)).toBe(true);

  // Keyboard: Escape with focus in the panel closes it; it stays closed for this page view.
  await panel.getByRole('button', { name: 'Închide panoul Pretoscop' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator(`#${HOST_ID}`)).toHaveCount(0);
  await page.close();
});

test('Altex page (synthetic markup): found by EAN; under 14 days "Istoric insuficient" and no badge', async () => {
  const page = await ctx.newPage();
  await page.goto(ALTEX_URL);
  const panel = page.locator(`#${HOST_ID}`).getByRole('region', { name: 'Pretoscop: istoricul prețului' });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  expect(Object.fromEntries(new URLSearchParams(lookups.at(-1)!))).toEqual({ url: ALTEX_URL, gtin: fx.young.gtin });
  await expect(panel).toContainText(fx.young.title);
  await expect(panel.getByRole('listitem').first()).toHaveText('Istoric insuficient');
  await expect(panel).toContainText(`Istoric de ${fx.young.observationsDays} zile: prea scurt pentru o evaluare.`);
  await expect(panel).not.toContainText('față de minimul din 30 de zile');
  // The verdict is the only badge ("Minim istoric" stays a stats label, as on the product page).
  await expect(panel.getByRole('list').first().getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByRole('listitem').filter({ hasText: /^Minim istoric$/ })).toHaveCount(0);
  await expect(panel).toContainText('1.299,00 lei');
  await expect(panel).toContainText('la IT Galaxy');
  await expect(panel.getByRole('link')).toHaveAttribute('href', `${base}/p/${fx.young.slug}`);
  // The close button works with a click too.
  await panel.getByRole('button', { name: 'Închide panoul Pretoscop' }).click();
  await expect(page.locator(`#${HOST_ID}`)).toHaveCount(0);
  await page.close();
});

test('a listing page sends nothing and shows nothing; with the flag off, a product page shows nothing', async () => {
  const page = await ctx.newPage();
  const n = lookups.length;
  await page.goto('https://www.emag.ro/telefoane-mobile/c');
  await page.waitForTimeout(3000);
  await expect(page.locator(`#${HOST_ID}`)).toHaveCount(0);
  expect(lookups.length).toBe(n);

  cli('ext-flag', JSON.stringify({ enabled: false }));
  try {
    // Another address of the TV (the extension keeps earlier answers in memory for 10 minutes).
    const other = fx.tv.emagUrl.replace('televizor-testoscop', 'tv-testoscop');
    pages.set(other, emagTvPage().split(fx.tv.emagUrl).join(other));
    await page.goto(other);
    await expect.poll(() => lookups.length).toBe(n + 1);
    await page.waitForTimeout(1500);
    await expect(page.locator(`#${HOST_ID}`)).toHaveCount(0);
  } finally {
    cli('ext-flag', JSON.stringify({ enabled: true }));
  }
  await page.close();
});

test.describe('GET /api/ext/lookup', () => {
  test('public read-only data: CORS for any origin, no cookies, the app’s CSP; 404 and 400 refuse to guess', async ({ request }) => {
    const res = await request.get(`/api/ext/lookup?url=${encodeURIComponent(fx.tv.emagUrl)}`, { headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'cf-connecting-ip': '198.51.100.10' } });
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h['access-control-allow-origin']).toBe('*');
    expect(h['access-control-allow-credentials']).toBeUndefined();
    expect(h['set-cookie']).toBeUndefined();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['x-robots-tag']).toBe('noindex');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['badges', 'best_offers', 'history', 'history_started_at', 'low_30d', 'low_all_time', 'matched_by', 'median_30d', 'observations_days', 'product_id', 'slug', 'title', 'updated_at', 'url', 'verdict'].sort(),
    );
    expect(body).toMatchObject({ product_id: fx.tv.id, slug: fx.tv.slug, matched_by: 'url', low_30d: '2449.00', verdict: { code: 'good_price', label: 'Preț bun' } });
    expect((body.history as unknown[]).length).toBe(41);
    expect(JSON.stringify(body)).not.toMatch(/e2e-fixture\/ext|itgalaxy\.ro|emag\.ro|icecat|image/i);

    const pre = await request.fetch('/api/ext/lookup', { method: 'OPTIONS', headers: { origin: 'https://www.emag.ro', 'access-control-request-method': 'GET', 'cf-connecting-ip': '198.51.100.10' } });
    expect(pre.status()).toBe(204);
    expect(pre.headers()['access-control-allow-origin']).toBe('*');
    expect(pre.headers()['access-control-allow-methods']).toBe('GET, OPTIONS');

    const nf = await request.get('/api/ext/lookup?url=https%3A%2F%2Fwww.emag.ro%2Fx%2Fpd%2FDNOTOURS1%2F', { headers: { 'cf-connecting-ip': '198.51.100.10' } });
    expect(nf.status()).toBe(404);
    expect(await nf.json()).toEqual({ error: 'not_found' });
    const bad = await request.get('/api/ext/lookup?brand=Testoscop', { headers: { 'cf-connecting-ip': '198.51.100.10' } });
    expect(bad.status()).toBe(400);
    expect(bad.headers()['access-control-allow-origin']).toBe('*');
  });

  test('CORS stays on this route only', async ({ request }) => {
    for (const path of [`/api/products/${fx.tv.id}/history?range=30d`, '/api/suggest?q=televizor', `/p/${fx.tv.slug}`]) {
      const res = await request.get(path, { headers: { origin: 'https://evil.example' } });
      expect(res.headers()['access-control-allow-origin'], path).toBeUndefined();
    }
  });

  test('per-shop kill switch (flag config disabled_shops)', async ({ request }) => {
    cli('ext-flag', JSON.stringify({ enabled: true, config: { disabled_shops: ['altex'] } }));
    try {
      const headers = { 'cf-connecting-ip': '198.51.100.11' };
      const altex = await request.get(`/api/ext/lookup?url=${encodeURIComponent(ALTEX_URL)}&gtin=${fx.young.gtin}`, { headers });
      expect(altex.status()).toBe(503);
      expect(await altex.json()).toEqual({ error: 'disabled' });
      expect((await request.get(`/api/ext/lookup?url=${encodeURIComponent(fx.tv.emagUrl)}`, { headers })).status()).toBe(200);
    } finally {
      cli('ext-flag', JSON.stringify({ enabled: true }));
    }
  });

  test('rate limit: 20 lookups a minute per client, then 429 with Retry-After (CORS headers kept)', async ({ request }) => {
    const headers = { 'cf-connecting-ip': '198.51.100.12' };
    for (let i = 0; i < 20; i++) expect((await request.get(`/api/ext/lookup?gtin=${fx.young.gtin}`, { headers })).status()).toBe(200);
    const over = await request.get(`/api/ext/lookup?gtin=${fx.young.gtin}`, { headers });
    expect(over.status()).toBe(429);
    expect(Number(over.headers()['retry-after'])).toBeGreaterThan(0);
    expect(over.headers()['access-control-allow-origin']).toBe('*');
    expect(over.headers()['access-control-expose-headers']).toBe('retry-after');
    // Another client is not affected.
    expect((await request.get(`/api/ext/lookup?gtin=${fx.young.gtin}`, { headers: { 'cf-connecting-ip': '198.51.100.13' } })).status()).toBe(200);
  });
});
