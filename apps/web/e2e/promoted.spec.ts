import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { signedStripeHeaders, startStripeMock, stripeEvent, type StripeMock } from '@pretoscop/payments/testing';
import { runTsx } from './fixture';
import { latestMail } from './mailpit';
import { E2E_STRIPE } from './promoted-env';

/**
 * M25 promoted placements, end to end against a local Stripe mock: an approved merchant accepts the
 * terms → tops up its wallet through Stripe Checkout (VAT on top) → the signed webhook credits it
 * exactly once → it creates a campaign → visitors see the labelled "Promovat" slot above an
 * unchanged offers list (the first row is still the cheapest) → a click bills once per session and
 * goes to the shop's plain URL → a second visitor's click uses up the daily cap and the slot
 * disappears → bots and clicks without our referer are never billed → the merchant and the admin
 * see the spend; the admin refunds a click. The optional ad slot stays out of a build without an
 * AdSense id, whatever the flag says. Desktop project only (one money flow per run).
 */

const ui = expect.configure({ timeout: 20_000 });
const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));
const ADMIN = 'admin@pretoscop.test';
const RUN = Date.now().toString(36);
const EMAIL = `promovare-e2e-${RUN}@pretoscop.test`;

interface Fixture {
  merchantId: number;
  shopName: string;
  shopDomain: string;
  productId: number;
  slug: string;
  categoryId: number;
  categoryPath: string;
  offers: Record<'promo' | 'itgalaxy' | 'forit', { offerId: number; totalBani: number }>;
  flagsWere: Record<string, boolean>;
}
interface State {
  balanceBani: number | null;
  billed: number;
  billedBani: number;
  notBilled: Record<string, number>;
  ledger: Array<{ kind: string; amountBani: number }>;
  topups: Array<{ status: string; netBani: number; grossBani: number; externalId: string | null }>;
  clicks: Array<{ placement: string | null; isAffiliate: boolean }>;
}

function cli<T>(cmd: string, ...args: string[]): T {
  const out = runTsx(DB_DIR, ['src/cli/e2e-fixture.ts', cmd, ...args]);
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e-fixture ${cmd}: no JSON\n${out}`);
  return JSON.parse(line) as T;
}
const state = () => cli<State>('promoted-state', String(f.merchantId));

let f: Fixture;
let stripe: StripeMock;
let merchant: Page;
let organicOrder: string[] = [];
let placementId = 0;

async function magicLink(email: string, since: number): Promise<string> {
  const mail = await latestMail(email, since, /./, 30_000);
  const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(mail.Text)?.[1];
  if (!link) throw new Error(`no magic link for ${email}`);
  return link;
}

/** The ids of the offers table's click-outs, in page order (the organic ranking). */
async function offersOrder(page: Page): Promise<string[]> {
  return page.locator('a[href^="/out/"][href$="p=offers_table"]').evaluateAll((as) => as.map((a) => /\/out\/(\d+)/.exec(a.getAttribute('href') ?? '')?.[1] ?? ''));
}

async function visitor(browser: Browser, userAgent?: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(userAgent ? { userAgent } : {});
  return { context, page: await context.newPage() };
}

/**
 * Clicks the "Promovat" link like a visitor and returns where the click-out sends them (the
 * fixture shop's domain does not exist, so the browser stops there; the redirect is what counts).
 */
async function clickPromoted(page: Page): Promise<string> {
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes('/out/') && r.request().isNavigationRequest()), page.getByTestId('promoted-link').click()]);
  expect(res.status()).toBe(302);
  return res.headers().location ?? '';
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one money flow per run (desktop)');
  stripe = await startStripeMock({ port: E2E_STRIPE.port(Number(new URL(info.project.use.baseURL!).port)) });
  f = cli<Fixture>('promoted-create', EMAIL);
  merchant = await (await browser.newContext()).newPage();
});

test.afterAll(async () => {
  await stripe?.close();
  if (f) cli('promoted-drop', JSON.stringify(f.flagsWere));
});

test('a visitor sees the product page without any slot before a campaign exists', async ({ browser }) => {
  const { context, page } = await visitor(browser);
  await page.goto(`/p/${f.slug}`);
  await ui(page.getByRole('heading', { level: 1 })).toContainText('Promovoscop P1');
  await expect(page.getByTestId('promoted-slot')).toHaveCount(0);
  organicOrder = await offersOrder(page);
  expect(organicOrder).toHaveLength(3);
  // The organic list: by total price (2.349 < 2.419 < 2.499 lei).
  expect(organicOrder).toEqual([f.offers.itgalaxy.offerId, f.offers.forit.offerId, f.offers.promo.offerId].map(String));
  await context.close();
});

test('the merchant accepts the terms, tops up through Stripe Checkout and the signed webhook credits the wallet once', async ({ request }) => {
  await merchant.goto('/pentru-magazine/autentificare');
  await merchant.getByLabel('Adresa de email').fill(EMAIL);
  const since = Date.now();
  await merchant.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();
  await ui(merchant.getByTestId('merchant-link-sent')).toBeVisible();
  await merchant.goto(await magicLink(EMAIL, since));
  await ui(merchant).toHaveURL(/\/pentru-magazine\/cont/);
  await merchant.getByTestId('promoted-portal-link').click();
  await ui(merchant).toHaveURL(/\/pentru-magazine\/cont\/promovare/);

  // The box is unticked: submitting without it refuses.
  await merchant.getByRole('button', { name: 'Activează promovarea' }).click();
  await ui(merchant.locator('p[role="alert"]')).toContainText('Bifează acceptarea');
  await merchant.getByTestId('promoted-terms').check();
  await merchant.getByRole('button', { name: 'Activează promovarea' }).click();
  await ui(merchant.getByTestId('promoted-balance')).toHaveText('0,00 lei');

  // An amount under the minimum is refused before any checkout opens.
  await merchant.getByLabel('Suma de alimentat (lei)').fill('20');
  await merchant.getByRole('button', { name: 'Plătește cu cardul (Stripe)' }).click();
  await ui(merchant.locator('p[role="alert"]')).toContainText('Suma trebuie să fie între');
  expect(stripe.sessions).toHaveLength(0);

  await merchant.getByLabel('Suma de alimentat (lei)').fill('150');
  await merchant.getByRole('button', { name: 'Plătește cu cardul (Stripe)' }).click();
  await ui(merchant.getByTestId('mock-amount')).toHaveText('181.50 ron');
  const session = stripe.sessions.at(-1)!;
  expect(session.authorization).toBe(`Bearer ${E2E_STRIPE.secretKey}`);
  expect(session.params).toMatchObject({ mode: 'payment', 'line_items[0][price_data][currency]': 'ron', 'line_items[0][price_data][unit_amount]': '18150', customer_email: EMAIL });
  const reference = session.params.client_reference_id!;
  expect(reference).toMatch(/^topup:\d+$/);
  expect(session.idempotencyKey).toBe(reference);

  // Coming back from the payment page credits nothing: only the webhook does.
  await merchant.getByTestId('mock-success').click();
  await ui(merchant.locator('p[role="status"]')).toContainText('Plata a fost trimisă');
  await expect(merchant.getByTestId('promoted-balance')).toHaveText('0,00 lei');

  const body = stripeEvent('checkout.session.completed', { id: session.id, reference, amountBani: 18_150 });
  const forged = await request.post('/api/webhooks/stripe', { data: body, headers: signedStripeHeaders('whsec_wrong', body) });
  expect(forged.status()).toBe(401);
  const paid = await request.post('/api/webhooks/stripe', { data: body, headers: signedStripeHeaders(E2E_STRIPE.webhookSecret, body) });
  expect(paid.status()).toBe(200);
  expect(await paid.json()).toMatchObject({ result: 'credited' });
  const again = await request.post('/api/webhooks/stripe', { data: body, headers: signedStripeHeaders(E2E_STRIPE.webhookSecret, body) });
  expect(await again.json()).toMatchObject({ result: 'duplicate' });

  const s = state();
  expect(s.balanceBani).toBe(15_000);
  expect(s.topups).toEqual([{ status: 'paid', netBani: 15_000, grossBani: 18_150, externalId: session.id }]);
  expect(s.ledger).toEqual([{ kind: 'topup', amountBani: 15_000 }]);
  await merchant.reload();
  await ui(merchant.getByTestId('promoted-balance')).toHaveText('150,00 lei');
});

test('the merchant creates a campaign: 1,00 lei per click, 2,00 lei a day', async () => {
  await merchant.getByLabel('Categorie (include subcategoriile)').selectOption(String(f.categoryId));
  await merchant.getByLabel('Oferta maximă pe clic (lei)').fill('1,00');
  await merchant.getByLabel('Plafon zilnic (lei)').fill('0,50');
  await merchant.getByRole('button', { name: 'Creează campania' }).click();
  await ui(merchant.locator('p[role="alert"]')).toContainText('Plafonul zilnic trebuie să fie cel puțin cât oferta');
  await merchant.getByLabel('Categorie (include subcategoriile)').selectOption(String(f.categoryId));
  await merchant.getByLabel('Oferta maximă pe clic (lei)').fill('1,00');
  await merchant.getByLabel('Plafon zilnic (lei)').fill('2,00');
  await merchant.getByRole('button', { name: 'Creează campania' }).click();
  await ui(merchant.locator('p[role="status"]')).toContainText('Campania a fost creată');
  await expect(merchant.getByTestId('promoted-campaigns')).toContainText('pornită');
});

test('visitors see the labelled slot above an unchanged list; the first row is still the cheapest', async ({ browser }) => {
  const { context, page } = await visitor(browser);
  await page.goto(`/p/${f.slug}`);
  const slot = page.getByTestId('promoted-slot');
  await ui(slot).toBeVisible();
  await expect(slot.getByTestId('promoted-label')).toHaveText('Promovat');
  await expect(slot).toContainText(`${f.shopName} plătește pentru acest spațiu`);
  await expect(slot).toContainText('2.499,00 lei');
  // 2.499 − 2.349 = 150 lei more than the cheapest live offer, and it says so.
  await expect(slot.getByTestId('promoted-more-expensive')).toHaveText('Cu 150,00 lei mai scump decât cea mai mică ofertă de acum (2.349,00 lei).');
  await expect(slot.getByTestId('promoted-link')).toHaveAttribute('rel', 'sponsored nofollow noopener');
  placementId = Number(await slot.getAttribute('data-placement'));
  expect(placementId).toBeGreaterThan(0);
  // Default ranking unchanged (snapshot of the organic order before the campaign).
  expect(await offersOrder(page)).toEqual(organicOrder);
  // The slot sits outside the offers table.
  await expect(page.locator('table [data-testid="promoted-slot"]')).toHaveCount(0);

  // The category page has one slot too (first page), for the same campaign.
  await page.goto(`/c/${f.categoryPath}`);
  await ui(page.getByTestId('promoted-slot')).toContainText('Promovoscop P1');
  await expect(page.getByTestId('promoted-link')).toHaveAttribute('href', `/out/${f.offers.promo.offerId}?p=promoted_category&k=${placementId}&c=${f.categoryId}`);
  await context.close();
});

test('a click bills once per session at the floor and goes to the plain shop URL; a second visitor uses up the cap and the slot disappears', async ({ browser }) => {
  const shopUrl = `https://www.${f.shopDomain}/e2e-fixture/promovare-promo`;
  const first = await visitor(browser);
  await first.page.goto(`/p/${f.slug}`);
  expect(await clickPromoted(first.page)).toBe(shopUrl);
  // Single bidder: the band's floor (0,60 lei for 1.000–2.999,99 lei), not the 1,00 lei bid.
  let s = state();
  expect(s).toMatchObject({ billed: 1, billedBani: 60, balanceBani: 15_000 - 60 });
  // Same visitor, same day: logged, not billed.
  await first.page.goto(`/p/${f.slug}`);
  expect(await clickPromoted(first.page)).toBe(shopUrl);
  s = state();
  expect(s).toMatchObject({ billed: 1, notBilled: { duplicate: 1 } });
  await first.context.close();

  // Another visitor (another browser): billed; 2,00 − 1,20 lei left is below the 1,00 lei bid.
  const second = await visitor(browser, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 e2e-second');
  await second.page.goto(`/p/${f.slug}`);
  expect(await clickPromoted(second.page)).toBe(shopUrl);
  s = state();
  expect(s).toMatchObject({ billed: 2, billedBani: 120, balanceBani: 15_000 - 120 });
  expect(s.ledger.map((l) => [l.kind, l.amountBani])).toEqual([
    ['topup', 15_000],
    ['click', -60],
    ['click', -60],
  ]);
  // Every promoted click-out was logged, and none carried an affiliate link (no double counting).
  expect(s.clicks.filter((c) => c.placement === 'promoted_product')).toHaveLength(3);
  expect(s.clicks.every((c) => !c.isAffiliate)).toBe(true);

  // The cap stops the display at once (the click refreshed the cached page).
  await second.page.goto(`/p/${f.slug}`);
  await ui(second.page.getByRole('heading', { level: 1 })).toContainText('Promovoscop P1');
  await expect(second.page.getByTestId('promoted-slot')).toHaveCount(0);
  expect(await offersOrder(second.page)).toEqual(organicOrder);
  await second.context.close();
});

test('bots, prefetches and links without one of our pages as referer are never billed', async ({ request, baseURL }) => {
  const href = `/out/${f.offers.promo.offerId}?p=promoted_product&k=${placementId}`;
  const bot = await request.get(href, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', referer: `${baseURL}/p/${f.slug}` }, maxRedirects: 0 });
  expect(bot.status()).toBe(302);
  expect(bot.headers().location).toBe(`https://www.${f.shopDomain}/e2e-fixture/promovare-promo`);
  const prefetch = await request.get(href, { headers: { 'user-agent': 'Mozilla/5.0 e2e-prefetch', 'sec-purpose': 'prefetch', referer: `${baseURL}/p/${f.slug}` }, maxRedirects: 0 });
  expect(prefetch.status()).toBe(302);
  const direct = await request.get(href, { headers: { 'user-agent': 'Mozilla/5.0 e2e-direct' }, maxRedirects: 0 });
  expect(direct.status()).toBe(302);
  const s = state();
  expect(s).toMatchObject({ billed: 2, billedBani: 120 });
  expect(s.notBilled).toMatchObject({ bot: 1, prefetch: 1, no_referer: 1, duplicate: 1 });
});

test('the merchant sees spend, billed clicks and the cost per click', async () => {
  await merchant.goto('/pentru-magazine/cont/promovare');
  await ui(merchant.getByTestId('promoted-stat-Cheltuit azi')).toHaveText('1,20 lei');
  await expect(merchant.getByTestId('promoted-stat-Clicuri facturate (30 de zile)')).toHaveText('2');
  await expect(merchant.getByTestId('promoted-stat-Cost mediu pe clic')).toHaveText('0,60 lei');
  await expect(merchant.getByTestId('promoted-balance')).toHaveText('148,80 lei');
  await expect(merchant.getByTestId('promoted-not-billed')).toContainText('roboți și instrumente automate: 1');
  await expect(merchant.getByTestId('promoted-ledger')).toContainText('Clic facturat −0,60 lei');
});

test('the admin sees the wallet and refunds a billed click; the statement reconciles', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/admin');
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await ui(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await magicLink(ADMIN, since));
  await ui(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/promovare');
  await ui(page.getByRole('heading', { name: 'Promovare' })).toBeVisible();
  const clickRow = page
    .locator('#clicuri tr')
    .filter({ hasText: f.shopName })
    .filter({ has: page.getByRole('button', { name: 'Returnează' }) })
    .first();
  await clickRow.getByLabel('Motiv').fill('test e2e: clic contestat');
  await clickRow.getByRole('button', { name: 'Returnează' }).click();
  await ui(page.getByText('Clicul a fost returnat în sold.')).toBeVisible();
  const s = state();
  expect(s.balanceBani).toBe(15_000 - 60);
  expect(s.ledger.at(-1)).toEqual({ kind: 'click_refund', amountBani: 60 });
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const csv = await page.request.get(`/admin/promovare/extras?luna=${month}`);
  expect(csv.status()).toBe(200);
  const line = (await csv.text()).split('\r\n').find((l) => l.startsWith(`${f.merchantId},`));
  // opening 0, 1 top-up 150 net + 31,50 VAT, 2 clicks 1,20, refund 0,60, closing 149,40.
  expect(line).toBe(`${f.merchantId},SC Magazin Promovat E2E SRL,18547290,${f.shopName},0.00,1,150.00,31.50,181.50,2,1.20,0.60,0.00,149.40`);
  await page.context().close();
});

test('the optional ad slot never appears in a build without an AdSense id, even with its flag on', async ({ browser }) => {
  cli('promoted-flag', 'ads.slots.enabled', 'on');
  try {
    const { context, page } = await visitor(browser);
    const res = await page.goto(`/p/${f.slug}?ads=${RUN}`);
    const csp = res!.headers()['content-security-policy'] ?? '';
    expect(csp).not.toMatch(/googlesyndication|doubleclick|adtrafficquality/);
    expect(csp).not.toContain('frame-src');
    await ui(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('ad-slot')).toHaveCount(0);
    await expect(page.locator('script[src*="googlesyndication"]')).toHaveCount(0);
    await context.close();
  } finally {
    cli('promoted-flag', 'ads.slots.enabled', f.flagsWere['ads.slots.enabled'] ? 'on' : 'off');
  }
});
