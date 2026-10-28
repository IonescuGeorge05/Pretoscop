import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * M20 merchant portal, end to end: register by magic link → company data (domain verified by the
 * email address) → a feed URL on a private address the guard refuses → the feed URL on the local
 * fixture server → worker check and preview → submit → admin approval → the worker pulls the feed →
 * the dashboard counts the offers → the offer is on the public product page → suspension hides it.
 * Needs the worker running against the same database with CRAWL_ENABLED=true, the SSRF guard ON
 * except for the fixture server (FETCH_PRIVATE_ALLOWLIST=127.0.0.1:<M20_FEED_PORT>) and every
 * registry source killed (scripts/verify/M20.sh does it).
 */

/** UI assertions wait longer than the 5 s default: magic-link mails and server actions run on a shared, busy machine. */
const ui = expect.configure({ timeout: 20_000 });

const MAILPIT = 'http://localhost:8025/api/v1';
/** The checkout's own database (environment first, then the repo's .env), never a hard-coded shared one. */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  (() => {
    try {
      return /^DATABASE_URL=(.*)$/m.exec(readFileSync(new URL('../../../.env', import.meta.url), 'utf8'))?.[1]?.trim();
    } catch {
      return undefined;
    }
  })() ??
  'postgres://pretoscop:pretoscop@localhost:5432/pretoscop_m20';
const FEED_PORT = Number(process.env.M20_FEED_PORT ?? 3399);
const ADMIN = 'admin@pretoscop.test';
const DOMAIN = 'testoscop-shop.ro';
const OWNER = `proprietar@${DOMAIN}`;

const requireFromDb = createRequire(new URL('../../../packages/db/package.json', import.meta.url));
interface PgClient {
  connect(): Promise<void>;
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}
const { Client } = requireFromDb('pg') as { Client: new (cfg: { connectionString: string }) => PgClient };
async function query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return (await c.query<R>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

const item = (id: string, title: string, price: string, gtin: string) => `
    <item>
      <g:id>${id}</g:id>
      <g:title>${title}</g:title>
      <g:link>https://www.${DOMAIN}/p/${id.toLowerCase()}</g:link>
      <g:price>${price} RON</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:brand>Testoscop</g:brand>
      <g:gtin>${gtin}</g:gtin>
      <g:shipping><g:country>RO</g:country><g:price>19.99 RON</g:price></g:shipping>
    </item>`;
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Testoscop Shop</title>
${item('TS-1', 'Casti wireless Testoscop Aero 2, Bluetooth 5.3, negru (produs de test E2E)', '249.90', '5940000000011')}
${item('TS-2', 'Boxa portabila Testoscop Boom 3, 20W, rezistenta la apa, albastru (produs de test E2E)', '399.00', '5940000000028')}
${item('TS-3', 'Incarcator rapid Testoscop 65W USB-C GaN, alb (produs de test E2E)', '129.99', '5940000000035')}
</channel></rss>`;

/** The fixture shop (allowed through the guard) and an "internal service" on another private port (refused). */
let server: http.Server;
let internal: http.Server;
let internalHits = 0;

const feedHandler: http.RequestListener = (req, res) => {
  if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /\n');
  if (req.url === '/feed.xml') {
    res.setHeader('content-type', 'application/xml; charset=utf-8');
    return res.end(FEED);
  }
  res.statusCode = 404;
  res.end('not found');
};

async function cleanup(): Promise<void> {
  const shops = await query<{ id: string }>(`SELECT id::text FROM shops WHERE domain = $1`, [DOMAIN]);
  for (const s of shops) {
    await query(`UPDATE products SET min_shop_id = NULL WHERE min_shop_id = $1`, [s.id]);
    await query(`DELETE FROM price_events WHERE offer_id IN (SELECT id FROM offers WHERE shop_id = $1)`, [s.id]);
    await query(`DELETE FROM clicks WHERE shop_id = $1`, [s.id]);
    await query(`DELETE FROM offers WHERE shop_id = $1`, [s.id]);
  }
  await query(`DELETE FROM merchants WHERE domain = $1 OR contact_email = $2`, [DOMAIN, OWNER]);
  await query(`DELETE FROM shop_sources WHERE shop_id IN (SELECT id FROM shops WHERE domain = $1)`, [DOMAIN]);
  await query(`DELETE FROM shops WHERE domain = $1`, [DOMAIN]);
  await query(`DELETE FROM users WHERE email = $1`, [OWNER]);
}

async function magicLink(email: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()) as { messages: { ID: string; Created: string }[] };
    const id = list.messages.find((m) => Date.parse(m.Created) >= since - 2000)?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no magic link for ${email}`);
}

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/admin');
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await ui(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await magicLink(ADMIN, since));
  await ui(page).toHaveURL(/\/admin$/);
  return page;
}

/** Lets the next feed check start now (the portal allows one per 30 s). */
async function skipCheckCooldown(): Promise<void> {
  await query(`UPDATE merchants SET validation = jsonb_set(validation, '{requestedAt}', to_jsonb($2::text)) WHERE contact_email = $1`, [
    OWNER,
    new Date(Date.now() - 5 * 60_000).toISOString(),
  ]);
}

test.describe('merchant portal', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only (one shared merchant per run)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    server = http.createServer(feedHandler);
    await new Promise<void>((resolve) => server.listen(FEED_PORT, '127.0.0.1', resolve));
    internal = http.createServer((req, res) => {
      internalHits++;
      feedHandler(req, res);
    });
    await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
    await cleanup();
    await query(`UPDATE feature_flags SET enabled = true WHERE key IN ('merchants.portal.enabled', 'crawl.enabled')`);
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => internal.close(() => resolve()));
    await cleanup();
  });

  test('register, verify by email domain, check the feed, submit, get approved, see the offer, get suspended', async ({ page, browser }) => {
    test.setTimeout(300_000);

    // 1. Magic-link registration lands in the portal.
    await page.goto('/pentru-magazine');
    await page.getByRole('link', { name: 'Înregistrează magazinul' }).click();
    await ui(page).toHaveURL(/\/pentru-magazine\/autentificare/);
    await page.getByLabel('Adresa de email').fill(OWNER);
    const since = Date.now();
    await page.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();
    await ui(page.getByTestId('merchant-link-sent')).toBeVisible();
    await page.goto(await magicLink(OWNER, since));
    await ui(page).toHaveURL(/\/pentru-magazine\/cont/);

    // 2. Company data; an address on the shop's domain verifies the domain.
    await page.getByLabel('Numele magazinului').fill('Testoscop Shop');
    await page.getByLabel('Adresa site-ului').fill(`https://www.${DOMAIN}`);
    await page.getByLabel('Denumirea firmei').fill('SC Testoscop Shop SRL');
    await page.getByLabel('CUI').fill('RO1234565');
    await page.getByRole('button', { name: 'Salvează datele' }).click();
    await ui(page.getByText('Datele au fost salvate.')).toBeVisible();
    await ui(page.getByTestId('domain-verified')).toContainText(`${DOMAIN} este verificat prin adresa de email`);
    const [m] = await query<{ cui: string; role: string }>(`SELECT m.cui, u.role FROM merchants m JOIN users u ON u.id = m.user_id WHERE u.email = $1`, [OWNER]);
    expect(m).toEqual({ cui: '1234565', role: 'merchant' });

    // 3a. The SSRF guard is on in the worker: a feed on another private address never gets a request.
    const internalPort = (internal.address() as AddressInfo).port;
    await page.getByLabel('Adresa feed-ului').fill(`http://127.0.0.1:${internalPort}/feed.xml`);
    await page.getByRole('button', { name: 'Salvează și verifică' }).click();
    await ui(page.getByTestId('feed-report')).toContainText('nu este o adresă publică de internet', { timeout: 60_000 });
    expect(internalHits).toBe(0);
    await skipCheckCooldown();

    // 3b. The fixture feed is checked by the worker: report and preview appear without a manual reload.
    await page.getByLabel('Adresa feed-ului').fill(`http://127.0.0.1:${FEED_PORT}/feed.xml`);
    await page.getByRole('button', { name: 'Salvează și verifică' }).click();
    await ui(page.getByTestId('feed-summary')).toContainText('3 pot fi afișate', { timeout: 60_000 });
    const preview = page.getByTestId('feed-preview');
    await ui(preview.locator('tbody tr')).toHaveCount(3);
    await ui(preview).toContainText('249,90 lei');
    await ui(preview).toContainText('269,89 lei');

    // 4–5. Accept the terms and submit.
    await page.getByTestId('accept-terms').check();
    await page.getByRole('button', { name: 'Trimite spre aprobare' }).click();
    await ui(page.getByTestId('merchant-status')).toHaveText('În așteptarea aprobării');

    // Admin approves; the feed source is created and run.
    const admin = await adminPage(browser);
    await admin.goto('/admin/comercianti');
    await admin.getByRole('link', { name: 'Testoscop Shop' }).click();
    await expect(admin.getByTestId('existing-shop-warning')).toHaveCount(0);
    await admin.getByTestId('approve').click();
    await ui(admin.getByRole('status')).toContainText('Magazinul a fost aprobat');
    const merchantUrl = admin.url();
    const [src] = await query<{ key: string; schedule: string; parser_key: string; source_tier: number }>(
      `SELECT s.key, s.schedule, s.parser_key, s.source_tier FROM shop_sources s JOIN shops p ON p.id = s.shop_id WHERE p.domain = $1`,
      [DOMAIN],
    );
    expect(src).toMatchObject({ key: 'testoscop-shop:feed:merchant', parser_key: 'feed-google-shopping', source_tier: 1 });
    expect(src!.schedule).toMatch(/^\d+ \*\/4 \* \* \*$/);

    // The worker pulls the feed; the dashboard shows the offers.
    await expect
      .poll(async () => Number((await query<{ n: string }>(`SELECT count(*)::text n FROM offers o JOIN shops p ON p.id = o.shop_id WHERE p.domain = $1 AND o.active`, [DOMAIN]))[0]!.n), {
        timeout: 90_000,
        intervals: [2000],
      })
      .toBe(3);
    await page.goto('/pentru-magazine/cont');
    await ui(page.getByTestId('merchant-status')).toHaveText('Aprobat');
    await ui(page.getByTestId('stat-Oferte afișate')).toHaveText('3');
    await ui(page.getByTestId('stat-Clicuri (30 de zile)')).toHaveText('0');
    const totals = await query<{ total: string }>(`SELECT total_price::text AS total FROM offers o JOIN shops p ON p.id = o.shop_id WHERE p.domain = $1 ORDER BY o.external_id`, [DOMAIN]);
    expect(totals.map((t) => t.total)).toEqual(['269.89', '418.99', '149.98']);

    // Matching puts the offer on a product page, where buyers see the shop.
    let slug = '';
    await expect
      .poll(
        async () => {
          const [r] = await query<{ slug: string }>(
            `SELECT p.slug FROM offers o JOIN products p ON p.id = o.product_id JOIN shops s ON s.id = o.shop_id
             WHERE s.domain = $1 AND o.external_id = 'TS-1' AND o.match_status IN ('auto','manual')`,
            [DOMAIN],
          );
          slug = r?.slug ?? '';
          return slug;
        },
        { timeout: 90_000, intervals: [2000] },
      )
      .not.toBe('');
    const buyer = await (await browser.newContext()).newPage();
    await buyer.goto(`/p/${slug}`);
    await ui(buyer.getByText('Testoscop Shop').first()).toBeVisible();

    // Suspension with a statement of reasons hides the offer at once.
    await admin.goto(merchantUrl.replace(/\?.*$/, ''));
    await admin.getByLabel('Motivul (P2B art. 4)').last().selectOption('preturi');
    await admin.getByLabel('Faptele pe care se sprijină decizia (le primește magazinul)').last().fill('Prețul din feed diferă de cel de pe site la 3 produse.');
    await admin.getByTestId('suspend').click();
    await ui(admin.getByRole('status')).toContainText('Listarea a fost suspendată');
    const [active] = await query<{ n: string }>(`SELECT count(*)::text n FROM offers o JOIN shops p ON p.id = o.shop_id WHERE p.domain = $1 AND o.active`, [DOMAIN]);
    expect(active!.n).toBe('0');
    await expect
      .poll(
        async () => {
          await buyer.goto(`/p/${slug}`);
          return buyer.getByText('Testoscop Shop').count();
        },
        { timeout: 20_000, intervals: [1000] },
      )
      .toBe(0);
    await page.goto('/pentru-magazine/cont');
    await ui(page.getByTestId('merchant-status')).toHaveText('Suspendat');
    await ui(page.getByTestId('status-reason')).toContainText('Prețul din feed diferă');
  });
});
