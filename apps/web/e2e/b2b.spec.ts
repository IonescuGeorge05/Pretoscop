import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, request as pwRequest, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { PositionDetailBody, PositionPage, SkuImportResult, Usage } from '../src/lib/b2b-api-schema';

/**
 * M28 B2B price intelligence, end to end on this checkout's database: an admin provisions a pilot
 * workspace for a merchant → the owner signs in by magic link, accepts the data-usage terms,
 * imports SKUs → the position table → the CSV export matches the table cell by cell → SKU page →
 * an API key (shown once) → API contract (zod schemas), tenant isolation, quota (429) and the
 * service switch. Own fixtures only (E2E_SHARED_FIXTURE=0); everything is removed afterwards and
 * `b2b.enabled` is put back as it was.
 */

const ui = expect.configure({ timeout: 20_000 });
const MAILPIT = 'http://localhost:8025/api/v1';
const PORT = Number(process.env.E2E_PORT ?? 3200);
const ADMIN = 'admin@pretoscop.test';
const OWNER = 'proprietar-b2b-e2e@firma-b2b-e2e.ro';
const TAG = 'e2e-b2b';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  (() => {
    try {
      return /^DATABASE_URL=(.*)$/m.exec(readFileSync(new URL('../../../.env', import.meta.url), 'utf8'))?.[1]?.trim();
    } catch {
      return undefined;
    }
  })() ??
  'postgres://pretoscop:pretoscop@localhost:5432/pretoscop';

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

/** A valid EAN-13 (Romanian GS1 prefix 594) for the fixture products. */
function ean(body12: string): string {
  const sum = [...body12].reduce((a, d, i) => a + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body12 + String((10 - (sum % 10)) % 10);
}
const GTINS = [ean('594900028001'), ean('594900028002'), ean('594900028003')];

/** The newest magic link to `email` since `since` that points at this checkout's server (Mailpit is shared). */
async function magicLink(email: string, since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=20`)).json()) as { messages: { ID: string; Created: string }[] };
    for (const m of list.messages.filter((x) => Date.parse(x.Created) >= since - 2000)) {
      const msg = (await (await fetch(`${MAILPIT}/message/${m.ID}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link && new URL(link).port === String(PORT)) return link;
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

async function ownerLogin(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto('/b2b');
  await ui(page).toHaveURL(/\/b2b\/autentificare/);
  await page.getByLabel('Adresa de email').fill(OWNER);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();
  await ui(page.getByTestId('merchant-link-sent')).toBeVisible();
  await page.goto(await magicLink(OWNER, since));
  await ui(page).toHaveURL(/\/b2b$/);
  return page;
}

/** One CSV line (RFC 4180 quoting; our exports have no line breaks inside cells). */
function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

let flagBefore = false;
let shops: Record<'own' | 'a' | 'b', number>;
let products: number[] = [];
let foreignWs = 0;
let foreignSku = 0;
let clientWs = 0;
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

async function cleanup(): Promise<void> {
  // Billing documents are kept by design (ON DELETE RESTRICT): the test removes its own first.
  await query(`DELETE FROM b2b_invoices WHERE workspace_id IN (SELECT id FROM b2b_workspaces WHERE name LIKE 'E2E B2B%')`);
  await query(`DELETE FROM b2b_billing_events WHERE event_id LIKE 'evt_e2e_b2b_%'`);
  await query(`DELETE FROM b2b_workspaces WHERE name LIKE 'E2E B2B%'`);
  const offers = `SELECT o.id FROM offers o JOIN shops s ON s.id = o.shop_id WHERE s.slug LIKE '${TAG}-%'`;
  await query(`DELETE FROM price_events WHERE offer_id IN (${offers})`);
  await query(`DELETE FROM offers WHERE id IN (${offers})`);
  await query(`DELETE FROM product_gtins WHERE product_id IN (SELECT id FROM products WHERE slug LIKE '${TAG}-%')`);
  await query(`DELETE FROM products WHERE slug LIKE '${TAG}-%'`);
  await query(`DELETE FROM shops WHERE slug LIKE '${TAG}-%'`);
  await query(`DELETE FROM users WHERE email = $1`, [OWNER]);
}

async function shop(key: string, name: string): Promise<number> {
  const [r] = await query<{ id: string }>(
    `INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier) VALUES ($1, $2, $3, $4, 'retail', 'active', 'direct', 2) RETURNING id::text`,
    [`${TAG}-${key}`, name, `${TAG}-${key}.ro`, `https://www.${TAG}-${key}.ro`],
  );
  return Number(r!.id);
}

async function offer(productId: number, shopId: number, key: string, lei: string, extra: { hoursAgo?: number; availability?: string } = {}): Promise<void> {
  const [o] = await query<{ id: string }>(
    `INSERT INTO offers (shop_id, external_id, url, title_raw, price, total_price, first_seen_at, last_seen_at, last_checked_at, price_changed_at,
       content_hash, active, source_tier, product_id, match_status, availability, condition, seller_type)
     VALUES ($1, $2, $3, $2, $4, $4, now() - interval '3 days', now(), now() - make_interval(hours => $5::int), now() - interval '2 hours', 'h', true, 1, $6, 'auto', $7, 'new', 'shop')
     RETURNING id::text`,
    [shopId, `${TAG}-${key}`, `https://www.${TAG}-shop.ro/${key}`, lei, extra.hoursAgo ?? 1, productId, extra.availability ?? 'in_stock'],
  );
  await query(`INSERT INTO price_events (offer_id, observed_at, price, availability) VALUES ($1, now() - interval '2 hours', $2, $3)`, [Number(o!.id), lei, extra.availability ?? 'in_stock']);
}

test.describe('B2B price intelligence', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await cleanup();
    flagBefore = (await query<{ enabled: boolean }>(`SELECT enabled FROM feature_flags WHERE key = 'b2b.enabled'`))[0]?.enabled ?? false;
    await query(`INSERT INTO feature_flags (key, enabled) VALUES ('b2b.enabled', true) ON CONFLICT (key) DO UPDATE SET enabled = true`);
    shops = { own: await shop('own', 'Magazin E2E B2B'), a: await shop('a', 'Rival E2E A'), b: await shop('b', 'Rival E2E B') };
    products = [];
    for (const [i, gtin] of GTINS.entries()) {
      const [p] = await query<{ id: string }>(`INSERT INTO products (slug, title, title_ascii) VALUES ($1, $2, $2) RETURNING id::text`, [`${TAG}-${i}`, `Produs B2B E2E ${i + 1}`]);
      products.push(Number(p!.id));
      await query(`INSERT INTO product_gtins (gtin14, product_id, source) VALUES ($1, $2, 'feed')`, [gtin.padStart(14, '0'), Number(p!.id)]);
    }
    // Product 1: we are above the minimum; product 2: we are the cheapest; product 3: no own offer.
    await offer(products[0]!, shops.own, 'own-1', '1000.00');
    await offer(products[0]!, shops.a, 'a-1', '950.00');
    await offer(products[0]!, shops.b, 'b-1', '900.00', { hoursAgo: 40 }); // stale: not in the minimum
    await offer(products[1]!, shops.own, 'own-2', '199.00');
    await offer(products[1]!, shops.a, 'a-2', '205.00');
    await offer(products[1]!, shops.b, 'b-2', '210.00');
    await offer(products[2]!, shops.a, 'a-3', '55.50');
    // Another customer's workspace with a SKU of its own (tenant isolation).
    const [w] = await query<{ id: string }>(`INSERT INTO b2b_workspaces (name, kind, plan, created_by, terms_accepted_at) VALUES ('E2E B2B Străin', 'brand', 'pilot', 'e2e', now()) RETURNING id::text`);
    foreignWs = Number(w!.id);
    const [k] = await query<{ id: string }>(
      `INSERT INTO b2b_skus (workspace_id, identity, product_id, status, match_method) VALUES ($1, $2, $3, 'matched', 'catalogue') RETURNING id::text`,
      [foreignWs, `product:${products[2]}`, products[2]],
    );
    foreignSku = Number(k!.id);
  });

  test.afterAll(async () => {
    await cleanup();
    await query(`UPDATE feature_flags SET enabled = $1 WHERE key = 'b2b.enabled'`, [flagBefore]);
  });

  test('provision, sign in, accept terms, import, read positions, export CSV, use the API', async ({ browser }) => {
    // 1. The admin creates a pilot workspace and invites the owner.
    const admin = await adminPage(browser);
    await admin.goto('/admin/b2b');
    const form = admin.getByTestId('b2b-create');
    await form.locator('input[name=name]').fill('E2E B2B Client');
    await form.locator('input[name=shop]').fill(`${TAG}-own`);
    await form.locator('input[name=ownerEmail]').fill(OWNER);
    await form.getByRole('button', { name: 'Creează' }).click();
    await ui(admin.getByTestId('b2b-admin-name')).toHaveText('E2E B2B Client');
    const wsId = Number(/\/admin\/b2b\/(\d+)/.exec(admin.url())![1]);
    clientWs = wsId;

    // 2. The owner signs in; the invitation becomes a membership; the terms come first.
    const ownerCtx = await browser.newContext();
    const page = await ownerLogin(ownerCtx);
    await page.getByTestId('b2b-workspace-link').filter({ hasText: 'E2E B2B Client' }).click();
    await ui(page.getByTestId('b2b-terms')).toBeVisible();
    await expect(page.getByTestId('b2b-positions')).toHaveCount(0);
    await page.goto(`/b2b/${wsId}/import`);
    await ui(page).toHaveURL(new RegExp(`/b2b/${wsId}$`)); // data pages wait for the terms
    await page.getByTestId('b2b-terms').locator('input[name=accept]').check();
    await page.getByRole('button', { name: 'Accept termenii' }).click();
    await ui(page.getByTestId('b2b-flash')).toContainText('Termenii au fost acceptați');
    const [terms] = await query<{ v: string; by: string | null }>(`SELECT terms_version AS v, terms_accepted_by AS by FROM b2b_workspaces WHERE id = $1`, [wsId]);
    expect(terms!.v).toMatch(/^b2bTerms\.v1@\d+\.\d+$/);
    expect(terms!.by).not.toBeNull();

    // 3. Import: three GTINs, an unknown MPN, a bad line and a duplicate.
    await page.goto(`/b2b/${wsId}/import`);
    await page.locator('textarea[name=list]').fill(['cod_intern;ean;mpn', `P1;${GTINS[0]};`, `P2;${GTINS[1]};`, `P3;${GTINS[2]};`, 'P4;;NECUNOSCUT-E2E-9', 'P5;123;', `P6;${GTINS[0]};`].join('\n'));
    await page.getByRole('button', { name: 'Importă' }).click();
    await ui(page.getByTestId('b2b-flash')).toContainText('Adăugate: 4 (găsite în catalog: 3, negăsite încă: 1, ambigue: 0). Deja urmărite sau repetate: 1. Rânduri cu erori: 1.');
    await expect(page.getByTestId('b2b-import-problems')).toContainText('rândul 6: GTIN invalid: 123');

    // 4. The position table.
    await page.goto(`/b2b/${wsId}`);
    const table = page.getByTestId('b2b-positions');
    await ui(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(4);
    const cell = (ref: string, col: string) => table.locator('tbody tr', { has: page.locator(`td[data-col=ref][data-value="${ref}"]`) }).locator(`td[data-col=${col}]`);
    await expect(cell('P1', 'pret_tau')).toHaveText('1.000,00 lei');
    await expect(cell('P1', 'minim')).toHaveText('950,00 lei');
    await expect(cell('P1', 'cel_mai_ieftin')).toHaveText('Rival E2E A');
    await expect(cell('P1', 'pozitie')).toHaveText('2');
    await expect(cell('P1', 'diferenta')).toHaveText('+5,3%');
    await expect(cell('P1', 'situatie')).toHaveText('peste cel mai mic');
    await expect(cell('P2', 'situatie')).toHaveText('cel mai mic preț');
    await expect(cell('P3', 'situatie')).toHaveText('fără prețul tău');
    await expect(cell('P4', 'situatie')).toHaveText('negăsit încă');
    await expect(page.getByTestId('b2b-stat-above')).toContainText('1');

    // 5. The CSV export holds exactly the table's values (formula-safe text, plain numbers).
    const href = await page.getByTestId('b2b-export-positions').getAttribute('href');
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^text\/csv/);
    expect(res.headers()['content-disposition']).toMatch(/attachment; filename="pretoscop-pozitii-\d+-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const csv = text.slice(1).replace(/\r\n$/, '').split('\r\n').map(csvLine);
    const header = await table.locator('thead th').allTextContents();
    expect(csv[0]).toEqual(header);
    const rows = await table.locator('tbody tr').all();
    expect(csv).toHaveLength(rows.length + 1);
    for (const [i, tr] of rows.entries()) {
      const values = await tr.locator('td').evaluateAll((tds) => tds.map((td) => td.getAttribute('data-value') ?? ''));
      expect(csv[i + 1]).toEqual(values);
    }

    // 6. The SKU page: every competitor offer, the stale one marked as not counted.
    await cell('P1', 'produs').getByRole('link').click();
    await ui(page.getByTestId('b2b-sku-title')).toHaveText('Produs B2B E2E 1');
    await expect(page.getByTestId('b2b-offers').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('b2b-offers').locator('td[data-col=comparabil]')).toHaveText(['nu', 'da']);
    await expect(page.getByTestId('b2b-sku-rank')).toHaveText(/2 din 2/);

    // 7. Tenant isolation in the UI: another workspace, its SKU and its export are "not found".
    expect((await page.goto(`/b2b/${foreignWs}`))!.status()).toBe(404);
    expect((await page.goto(`/b2b/${wsId}/sku/${foreignSku}`))!.status()).toBe(404);
    expect((await page.request.get(`/b2b/${foreignWs}/export?tip=pozitii`)).status()).toBe(404);
    // A customer is not an admin.
    await page.goto('/admin/b2b');
    await ui(page).toHaveURL(/\/admin\/autentificare/);

    // 8. An API key, shown once; only its hash is stored.
    await page.goto(`/b2b/${wsId}/api`);
    await page.locator('#key-name').fill('ERP E2E');
    await page.getByRole('button', { name: 'Creează o cheie' }).click();
    const key = (await ui(page.getByTestId('b2b-new-key')).toBeVisible().then(() => page.getByTestId('b2b-new-key').textContent()))!.trim();
    expect(key).toMatch(/^psk_[a-z2-7]{12}_[A-Za-z0-9_-]{43}$/);
    const stored = await query<{ secret_hash: string }>(`SELECT secret_hash FROM b2b_api_keys WHERE workspace_id = $1`, [wsId]);
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(key.slice(-43));
    await page.reload();
    await expect(page.getByTestId('b2b-new-key')).toHaveCount(0);
    await expect(page.getByTestId('b2b-keys')).toContainText('ERP E2E');

    // 9. The API: contract, isolation, refusals.
    const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { authorization: `Bearer ${key}` } });
    const anon = await pwRequest.newContext({ baseURL: `http://localhost:${PORT}` });
    const positions = await api.get('/api/v1/b2b/positions?limit=10');
    expect(positions.status()).toBe(200);
    expect(positions.headers()['cache-control']).toBe('no-store');
    const body = PositionPage.parse(await positions.json());
    expect(body.total).toBe(4);
    const p1 = body.data.find((d) => d.sku.ref === 'P1')!;
    expect(p1).toMatchObject({ own: { basis: 'offer', total: '1000.00' }, market: { min: '950.00', competitors: 1, cheapest_shop: 'Rival E2E A' }, rank: 2, status: 'above' });
    const one = await api.get(`/api/v1/b2b/skus/${p1.sku.id}`);
    expect(one.status()).toBe(200);
    const detail = PositionDetailBody.parse(await one.json());
    expect(detail.data.offers.map((o) => o.total)).toEqual(['900.00', '950.00']);
    expect(JSON.stringify(detail)).not.toMatch(/specs|image|attributes|email|ip_hash/i);
    expect((await api.get(`/api/v1/b2b/skus/${foreignSku}`)).status()).toBe(404);
    expect((await api.get(`/api/v1/b2b/skus/${foreignSku}/history`)).status()).toBe(404);
    expect((await api.delete(`/api/v1/b2b/skus/${foreignSku}`)).status()).toBe(404);
    expect((await query(`SELECT 1 FROM b2b_skus WHERE id = $1`, [foreignSku])).length).toBe(1);
    const added = await api.post('/api/v1/b2b/skus', { data: { skus: [{ mpn: 'API-E2E-77', ref: 'P7' }, { gtin: '123' }] } });
    expect(added.status()).toBe(200);
    expect(SkuImportResult.parse(await added.json())).toMatchObject({ added: 1, unmatched: 1, invalid: 1, errors: [{ index: 1, message: 'invalid gtin' }] });
    expect((await api.get('/api/v1/b2b/positions?limit=0')).status()).toBe(400);
    const noKey = await anon.get('/api/v1/b2b/positions');
    expect(noKey.status()).toBe(401);
    expect(noKey.headers()['www-authenticate']).toMatch(/^Bearer/);
    expect((await anon.get('/api/v1/b2b/positions', { headers: { authorization: `Bearer ${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}` } })).status()).toBe(401);
    expect((await anon.get('/api/v1/b2b/openapi.json')).status()).toBe(200);

    // 10. The daily quota: two more requests, then 429 with Retry-After.
    const usage = Usage.parse(await (await api.get('/api/v1/b2b/usage')).json());
    expect(usage.plan).toBe('pilot');
    await query(`UPDATE b2b_workspaces SET api_daily_quota = $2 WHERE id = $1`, [wsId, usage.quota.used + 2]);
    expect((await api.get('/api/v1/b2b/skus')).status()).toBe(200);
    const last = await api.get('/api/v1/b2b/skus');
    expect(last.status()).toBe(200);
    expect(last.headers()['x-ratelimit-remaining']).toBe('0');
    const over = await api.get('/api/v1/b2b/skus');
    expect(over.status()).toBe(429);
    expect(Number(over.headers()['retry-after'])).toBeGreaterThan(0);
    expect((await over.json()).error.code).toBe('quota_exceeded');

    // 11. Revoking the key and the service switch.
    await page.goto(`/b2b/${wsId}/api`);
    await page.getByRole('button', { name: 'Revocă' }).click();
    await ui(page.getByTestId('b2b-flash')).toContainText('Cheia a fost revocată');
    await query(`UPDATE b2b_workspaces SET api_daily_quota = NULL WHERE id = $1`, [wsId]);
    expect((await api.get('/api/v1/b2b/positions')).status()).toBe(401);
    await query(`UPDATE feature_flags SET enabled = false WHERE key = 'b2b.enabled'`);
    expect((await api.get('/api/v1/b2b/positions')).status()).toBe(503);
    await page.goto(`/b2b/${wsId}`);
    await ui(page).toHaveURL(/\/b2b\?eroare=inchis/);
    await query(`UPDATE feature_flags SET enabled = true WHERE key = 'b2b.enabled'`);
    // Every customer action was audited.
    const actions = (await query<{ action: string }>(`SELECT DISTINCT action FROM audit_log WHERE entity = 'b2b_workspaces' AND entity_id = $1`, [String(wsId)])).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['b2b.workspace_create', 'b2b.terms_accept', 'b2b.import', 'b2b.export', 'b2b.key_create', 'b2b.key_revoke']));
    await api.dispose();
    await anon.dispose();
    ownerState = await ownerCtx.storageState();
    await ownerCtx.close();
  });

  // Needs the web server started with B2B_STRIPE_WEBHOOK_SECRET (scripts/verify/M28.sh sets a test one).
  test('billing: only signed provider events change the plan, once; paid periods become invoices', async ({ browser }) => {
    const secret = process.env.B2B_STRIPE_WEBHOOK_SECRET;
    test.skip(!secret || !clientWs, 'no webhook secret for the e2e server');
    const anon = await pwRequest.newContext({ baseURL: `http://localhost:${PORT}` });
    const deliver = async (id: string, type: string, object: Record<string, unknown>, sig?: string) => {
      const body = JSON.stringify({ id, type, created: Math.floor(Date.now() / 1000), data: { object } });
      const t = Math.floor(Date.now() / 1000);
      const header = sig ?? `t=${t},v1=${createHmac('sha256', secret!).update(`${t}.${body}`).digest('hex')}`;
      return anon.post('/api/webhooks/stripe-b2b', { data: body, headers: { 'content-type': 'application/json', 'stripe-signature': header } });
    };
    await query(`UPDATE b2b_workspaces SET company_name = 'SC Client E2E SRL', cui = '14399840', billing_address = 'Str. Test 1, București' WHERE id = $1`, [clientWs]);
    const checkout = { mode: 'subscription', client_reference_id: `b2b:${clientWs}`, customer: 'cus_e2e', subscription: 'sub_e2e', payment_status: 'paid', metadata: { plan: 'pro' } };
    // Unsigned or tampered deliveries change nothing.
    expect((await deliver('evt_e2e_b2b_forged', 'checkout.session.completed', checkout, 't=1,v1=' + 'a'.repeat(64))).status()).toBe(400);
    expect((await query<{ plan: string }>(`SELECT plan FROM b2b_workspaces WHERE id = $1`, [clientWs]))[0]!.plan).toBe('pilot');
    const first = await deliver('evt_e2e_b2b_co', 'checkout.session.completed', checkout);
    expect(first.status()).toBe(200);
    expect((await first.json()).result).toBe('applied');
    expect((await (await deliver('evt_e2e_b2b_co', 'checkout.session.completed', checkout)).json()).result).toBe('duplicate');
    const invoice = {
      id: 'in_e2e',
      customer: 'cus_e2e',
      currency: 'eur',
      subtotal: 14_900,
      total: 18_029,
      total_taxes: [{ amount: 3_129 }],
      parent: { subscription_details: { subscription: 'sub_e2e', metadata: { workspace_id: String(clientWs), plan: 'pro' } } },
      lines: { data: [{ period: { start: Math.floor(Date.now() / 1000), end: Math.floor(Date.now() / 1000) + 30 * 86_400 } }] },
      status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
    };
    expect((await deliver('evt_e2e_b2b_inv', 'invoice.paid', invoice)).status()).toBe(200);
    const [w] = await query<{ plan: string; billing_status: string; billing_subscription_id: string }>(`SELECT plan, billing_status, billing_subscription_id FROM b2b_workspaces WHERE id = $1`, [clientWs]);
    expect(w).toEqual({ plan: 'pro', billing_status: 'active', billing_subscription_id: 'sub_e2e' });
    const [inv] = await query<{ total_amount: string; vat_rate: string; buyer_cui: string; efactura_status: string }>(
      `SELECT total_amount::text, vat_rate::text, buyer_cui, efactura_status FROM b2b_invoices WHERE workspace_id = $1`,
      [clientWs],
    );
    expect(inv).toEqual({ total_amount: '180.29', vat_rate: '21.00', buyer_cui: '14399840', efactura_status: 'to_issue' });
    // The owner sees the paid period; the admin sees it in the accountant's list and CSV.
    const owner = await (await browser.newContext({ storageState: ownerState ?? undefined })).newPage();
    await owner.goto(`/b2b/${clientWs}/setari`);
    await ui(owner.getByTestId('b2b-invoices')).toContainText('180,29');
    await expect(owner.getByTestId('b2b-plan')).toContainText('Pro');
    const admin = await adminPage(browser);
    await admin.goto('/admin/b2b/facturi');
    await ui(admin.getByText('SC Client E2E SRL')).toBeVisible();
    const csv = await admin.request.get(`/admin/b2b/facturi/csv?luna=${new Date().toISOString().slice(0, 7)}`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain('"SC Client E2E SRL","14399840"');
    // The subscription ends: the workspace is suspended with the billing reason.
    expect((await deliver('evt_e2e_b2b_del', 'customer.subscription.deleted', { id: 'sub_e2e', customer: 'cus_e2e', status: 'canceled', metadata: { workspace_id: String(clientWs) }, items: { data: [] } })).status()).toBe(200);
    expect((await query<{ status: string }>(`SELECT status FROM b2b_workspaces WHERE id = $1`, [clientWs]))[0]!.status).toBe('suspended');
    await owner.goto(`/b2b/${clientWs}`);
    await ui(owner).toHaveURL(/\/b2b\?eroare=inactiv/);
    await anon.dispose();
  });
});
