import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { latestMail, mailHeaders, mailsTo } from './mailpit';

// Price alerts (M19) end to end, against a throwaway product of its own (packages/db fixture
// "alerts"), real Mailpit email and the worker's evaluation and delivery (alerts:run CLI).
// Run alone with: E2E_SHARED_FIXTURE=0 pnpm exec playwright test e2e/alerts.spec.ts

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));
const WORKER_DIR = fileURLToPath(new URL('../../worker', import.meta.url));

interface AlertsFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
  flagWas: boolean;
}
interface State {
  userId: string | null;
  emailVerified: boolean | null;
  alerts: Array<Record<string, unknown>>;
  sends: Array<Record<string, unknown>>;
}
interface Evidence {
  consents: Array<Record<string, unknown>>;
  suppressions: Array<{ reason: string }>;
}

function cli<T>(cmd: string, ...args: string[]): T {
  const out = execFileSync('pnpm', ['exec', 'tsx', 'src/cli/e2e-fixture.ts', cmd, ...args], { cwd: DB_DIR, encoding: 'utf8' });
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e-fixture ${cmd}: no JSON\n${out}`);
  return JSON.parse(line) as T;
}

/** The worker's alerts.evaluate + alerts.deliver for the fixture product, without the job queue. */
function runAlerts(baseURL: string, productId: number): void {
  execFileSync('pnpm', ['exec', 'tsx', 'src/cli/alerts-run.ts', '--products', String(productId)], {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_BASE_URL: baseURL, LOG_LEVEL: 'warn' },
  });
}

let fx: AlertsFixture;
const used: string[] = [];
const newEmail = () => {
  const e = `alerte-e2e-${Date.now()}-${randomBytes(3).toString('hex')}@pretoscop.test`;
  used.push(e);
  return e;
};
const CONSENT = /Vreau să primesc pe email alerte de preț/;
/** After a server action or a cold page on a shared, busy dev machine. */
const SLOW = 20_000;

/** Creates an alert through the API (the enhanced form's path) and confirms it with the emailed link. */
async function confirmedAlert(request: APIRequestContext, email: string, body: Record<string, unknown>): Promise<void> {
  const since = Date.now();
  const res = await request.post('/api/alerts', { data: { productId: String(fx.productId), email, consent: true, consentVersion: 'alertConsent.v1', ...body } });
  expect(res.status()).toBe(201);
  expect(await res.json()).toEqual({ ok: true, status: 'pending' });
  const mail = await latestMail(email, since, /^Confirmă alerta de preț/);
  const u = new URL(/(https?:\/\/\S+\/alerte\/confirmare\?\S+)/.exec(mail.Text)![1]!);
  const c = await request.post('/api/alerts/confirm', { form: { a: u.searchParams.get('a')!, t: u.searchParams.get('t')! }, maxRedirects: 0 });
  expect(c.status()).toBe(303);
  expect(c.headers().location).toContain('stare=confirmat');
}

// One project only: the fixture and the feature flag are shared state, so the mobile project
// (another worker) must not create or drop them in parallel. The phone layout is checked with a
// phone-sized viewport below.
const ONLY = 'desktop';
// Each flow shells out to the fixture and worker CLIs several times (about 2 s each).
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.skip(({ isMobile }) => isMobile, 'alert flows run once, in the desktop project');

test.beforeAll(({}, info) => {
  if (info.project.name === ONLY) fx = cli<AlertsFixture>('alerts-create');
});
test.afterAll(({}, info) => {
  if (info.project.name === ONLY && fx) cli('alerts-drop', fx.flagWas ? 'on' : 'off', ...used);
});

test.describe('price alerts', () => {

  test('explicit consent, double opt-in, a drop email with one-click headers, no duplicate, unsubscribe in one click', async ({ page, request, baseURL }) => {
    const email = newEmail();
    const pending = newEmail();
    await page.goto(`/p/${fx.slug}`);
    const form = page.getByTestId('alert-form');
    await expect(form).toBeVisible();
    await form.getByLabel('Pragul de preț, în lei').fill('1.450');
    await form.getByLabel('Adresa de email').fill(email);
    const consent = form.getByRole('checkbox', { name: CONSENT });
    await expect(consent).not.toBeChecked(); // never pre-ticked
    await form.getByRole('button', { name: 'Pornește alerta' }).click();
    await expect(form.getByText('Bifează acordul')).toBeVisible();
    await consent.check();
    const since = Date.now();
    await form.getByRole('button', { name: 'Pornește alerta' }).click();
    await expect(page.getByTestId('alert-done')).toContainText('Verifică emailul', { timeout: SLOW });

    const confirmation = await latestMail(email, since, /^Confirmă alerta de preț/);
    expect(confirmation.Text).toContain('(alertConsent.v1)');
    expect(confirmation.Text).toContain('1.450,00 lei sau mai jos');
    const confirmUrl = /(https?:\/\/\S+\/alerte\/confirmare\?\S+)/.exec(confirmation.Text)![1]!;

    // A second address asks for an alert and never confirms it.
    const p2 = await request.post('/api/alerts', { data: { productId: String(fx.productId), email: pending, kind: 'any_drop', consent: true, consentVersion: 'alertConsent.v1' } });
    expect(p2.status()).toBe(201);

    // Opening the link changes nothing (mail scanners open links); the button confirms.
    await page.goto(confirmUrl);
    expect(cli<State>('alerts-state', email).alerts[0]).toMatchObject({ status: 'pending' });
    await page.getByRole('button', { name: 'Confirm alerta' }).click();
    await expect(page.getByRole('heading', { name: 'Gata, alerta este activă' })).toBeVisible({ timeout: SLOW });

    const state = cli<State>('alerts-state', email);
    expect(state.emailVerified).toBe(true);
    expect(state.alerts).toEqual([
      expect.objectContaining({ status: 'active', kind: 'below', target_price: '1450.00', consent_text_version: 'alertConsent.v1', consent_ip_hashed: true, confirmed: true, confirm_method: 'email_link', confirm_ip_hashed: true }),
    ]);
    expect(cli<Evidence>('alerts-evidence', email).consents).toEqual([
      expect.objectContaining({ purpose: 'alert_email', text_version: 'alertConsent.v1', given_ip_hashed: true, confirmed: true, withdrawn: false }),
    ]);

    // Synthetic drop on the test offer, then the worker's evaluation and delivery.
    const dropSince = Date.now();
    cli('alerts-price', 'a', '1399');
    runAlerts(baseURL!, fx.productId);
    const alert = await latestMail(email, dropSince, /^Preț mai mic/);
    expect(alert.Subject).toContain('1.399,00 lei');
    expect(alert.Text).toContain('Preț total acum: 1.399,00 lei la IT Galaxy');
    expect(alert.Text).toContain('Sub pragul tău de 1.450,00 lei.');
    expect(alert.Text).toMatch(/Verificat de Pretoscop pe .+ \(ora României\)/);
    expect(alert.Text).toContain(`/out/${fx.offers.a!.offerId}?p=alert`);
    expect(alert.Text).toContain('prețul final este cel afișat de magazin');
    const headers = await mailHeaders(alert.ID);
    expect(headers['List-Unsubscribe']?.[0]).toMatch(/^<https?:\/\/\S+\/api\/alerts\/unsubscribe\?u=[^&]+&t=[\w-]{22}>$/);
    expect(headers['List-Unsubscribe-Post']?.[0]).toBe('List-Unsubscribe=One-Click');

    // Nothing for the unconfirmed address; a second evaluation sends nothing new.
    expect((await mailsTo(pending, since)).filter((m) => m.Subject.startsWith('Preț mai mic'))).toEqual([]);
    runAlerts(baseURL!, fx.productId);
    expect((await mailsTo(email, dropSince)).filter((m) => m.Subject.startsWith('Preț mai mic'))).toHaveLength(1);

    // The stop link in the email: one button, no login.
    const stop = /Oprește această alertă: (\S+)/.exec(alert.Text)![1]!;
    await page.goto(stop);
    await page.getByRole('button', { name: 'Oprește alerta' }).click();
    await expect(page.getByRole('heading', { name: 'Gata, alerta este oprită' })).toBeVisible({ timeout: SLOW });
    expect(cli<State>('alerts-state', email).alerts).toEqual([]);
    expect(cli<Evidence>('alerts-evidence', email).consents[0]).toMatchObject({ withdrawn: true, withdraw_method: 'unsubscribe_link' });
    cli('alerts-price', 'a', '1499');
  });

  test('one-click List-Unsubscribe POST stops every alert and keeps only a hash of the address', async ({ request, baseURL }) => {
    const email = newEmail();
    await confirmedAlert(request, email, { kind: 'any_drop' });
    const dropSince = Date.now();
    cli('alerts-price', 'a', '1400');
    runAlerts(baseURL!, fx.productId);
    const mail = await latestMail(email, dropSince, /^Preț mai mic/);
    expect(mail.Text).toContain('Cu 6% sub 1.499,00 lei, prețul de la pornirea alertei.');
    const url = (await mailHeaders(mail.ID))['List-Unsubscribe']![0]!.slice(1, -1);

    expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(303); // a GET never unsubscribes
    expect(cli<State>('alerts-state', email).alerts).toHaveLength(1);
    const one = await request.post(url, { form: { 'List-Unsubscribe': 'One-Click' } });
    expect(one.status()).toBe(200);
    expect(cli<State>('alerts-state', email).userId).toBeNull(); // nothing left: the account is gone
    expect(cli<Evidence>('alerts-evidence', email)).toEqual({
      suppressions: [{ reason: 'unsubscribed' }],
      consents: [expect.objectContaining({ confirmed: true, withdrawn: true, withdraw_method: 'list_unsubscribe' })],
    });
    cli('alerts-price', 'a', '1499');
  });

  test('account page: magic-link login, the alert with its consent, JSON export, account deletion', async ({ page, request }) => {
    const email = newEmail();
    await confirmedAlert(request, email, { kind: 'below', target: '1.300' });
    await page.goto('/alerte');
    await page.getByLabel('Adresa de email').fill(email);
    const since = Date.now();
    await page.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();
    await expect(page.getByRole('heading', { name: 'Verifică emailul' })).toBeVisible({ timeout: SLOW });
    const login = await latestMail(email, since, /autentificare/);
    await page.goto(/(https?:\/\/\S+magic-link\/verify\S+)/.exec(login.Text)![1]!);
    await expect(page).toHaveURL(/\/alerte$/, { timeout: SLOW });
    const card = page.getByTestId('alert-card');
    await expect(card).toHaveCount(1, { timeout: SLOW });
    await expect(card).toContainText('1.300,00 lei sau mai jos');
    await expect(card).toContainText('alertConsent.v1');

    const res = await page.request.get('/api/account/export');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/attachment; filename="pretoscop-datele-mele-\d{4}-\d{2}-\d{2}\.json"/);
    const data = (await res.json()) as { user: { email: string }; alerts: Array<Record<string, unknown>>; consentRecords: unknown[] };
    expect(data.user.email).toBe(email);
    expect(data.alerts[0]).toMatchObject({ kind: 'below', consent_text_version: 'alertConsent.v1', confirm_method: 'email_link' });
    expect(data.consentRecords).toHaveLength(1);

    await page.getByRole('checkbox', { name: /Înțeleg că ștergerea contului este definitivă/ }).check();
    await page.getByRole('button', { name: 'Șterge contul' }).click();
    await expect(page.getByRole('heading', { name: 'Contul a fost șters' })).toBeVisible({ timeout: SLOW });
    expect(cli<State>('alerts-state', email).userId).toBeNull();
    expect((await page.request.get('/api/account/export')).status()).toBe(401);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the alert form still works as a plain HTML form', async ({ page }) => {
    const email = newEmail();
    await page.goto(`/p/${fx.slug}`);
    const form = page.getByTestId('alert-form');
    await form.getByLabel('La orice scădere de cel puțin 1%').check();
    await form.getByLabel('Adresa de email').fill(email);
    await form.getByRole('checkbox', { name: CONSENT }).check();
    await form.getByRole('button', { name: 'Pornește alerta' }).click();
    await expect(page).toHaveURL(/\/alerte\/rezultat\?stare=trimis/, { timeout: SLOW });
    await expect(page.getByRole('heading', { name: 'Verifică emailul' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Înapoi la produs' })).toHaveAttribute('href', `/p/${fx.slug}`);
    expect(cli<State>('alerts-state', email).alerts).toEqual([expect.objectContaining({ status: 'pending', kind: 'any_drop' })]);
  });
});

test('on a phone-sized screen the form fits and explains a target that would fire at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/p/${fx.slug}`);
  const form = page.getByTestId('alert-form');
  await form.scrollIntoViewIfNeeded();
  await expect(form.getByText('Prețul total minim acum, la magazinele care vând direct: 1.499,00 lei.')).toBeVisible();
  await form.getByLabel('Pragul de preț, în lei').fill('1.600');
  await form.getByLabel('Adresa de email').fill(newEmail());
  await form.getByRole('checkbox', { name: CONSENT }).check();
  const box = await form.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390); // no horizontal scroll
  await form.getByRole('button', { name: 'Pornește alerta' }).click();
  await expect(form.getByText('Prețul total de acum este deja sub acest prag')).toBeVisible();
});
