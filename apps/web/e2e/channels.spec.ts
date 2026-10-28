import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { fakeBrowserKeys, startMockPushService, startMockTelegram, type FakeBrowserSubscription, type MockPushService, type MockTelegram } from '@pretoscop/notify/testing';
import { E2E_TELEGRAM } from './channels-env';
import { runTsx } from './fixture';
import { latestMail } from './mailpit';

// Web Push and the Telegram bot (M27) end to end, with no request to a real push service or to
// Telegram: a local mock push service that checks the VAPID JWT and decrypts each message with the
// fake browser's keys (RFC 8291/8292, independent of web-push), a local mock of the Bot API, test
// VAPID keys made by playwright.config.ts, and the worker's own CLIs (alerts:run, telegram:poll).
// Run alone with: E2E_SHARED_FIXTURE=0 pnpm exec playwright test e2e/channels.spec.ts --project=desktop --workers=1

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));
const WORKER_DIR = fileURLToPath(new URL('../../worker', import.meta.url));
const VAPID_PUBLIC = process.env.E2E_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.E2E_VAPID_PRIVATE_KEY!;
const SLOW = 20_000;

interface Fixture {
  productId: number;
  slug: string;
  flagsWere: Record<string, boolean>;
}
interface State {
  userId: string | null;
  devices: Array<{ device_label: string; consent_text_version: string; local_endpoint: boolean }>;
  telegram: { chat_id: string; status: string; consent_text_version: string } | null;
  tokens: number;
  tokensHashed: boolean;
  alerts: Array<Record<string, unknown>>;
  consents: Array<{ purpose: string; per_alert: boolean; text_version: string; confirm_method: string | null; withdraw_method: string | null }>;
}

function cli<T>(cmd: string, ...args: string[]): T {
  const out = runTsx(DB_DIR, ['src/cli/e2e-fixture.ts', cmd, ...args]);
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e-fixture ${cmd}: no JSON\n${out}`);
  return JSON.parse(line) as T;
}

/** Noon in Bucharest today: push and Telegram never leave in quiet hours (22:00–08:00). */
const noonToday = () => `${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' })}T10:00:00Z`;

function workerEnv(baseURL: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PUBLIC_BASE_URL: baseURL,
    LOG_LEVEL: 'warn',
    VAPID_PUBLIC_KEY: VAPID_PUBLIC,
    VAPID_PRIVATE_KEY: VAPID_PRIVATE,
    TELEGRAM_BOT_TOKEN: E2E_TELEGRAM.token,
    TELEGRAM_BOT_USERNAME: E2E_TELEGRAM.username,
    ...extra,
  };
}

/**
 * A worker CLI, asynchronously: the mock push service and the mock Bot API run in this process, so a
 * synchronous child (runTsx) would block the very servers it talks to. Node with tsx, never a pnpm
 * shim (Windows). Rejects with the exit status on failure.
 */
function workerCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--import', 'tsx', ...args], { cwd: WORKER_DIR, env, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(`${args[0]}: ${stderr || err.message}`), { status: (err as { code?: number }).code }));
      else resolve(stdout);
    });
  });
}

/** The worker's alerts.evaluate + alerts.deliver for the fixture product, at noon (no quiet hours). */
async function runAlerts(baseURL: string, productId: number, tgApiBase: string): Promise<Record<string, unknown>> {
  const out = await workerCli(['src/cli/alerts-run.ts', '--products', String(productId), '--now', noonToday()], workerEnv(baseURL, { TELEGRAM_API_BASE: tgApiBase }));
  return JSON.parse(out.trim().split('\n').at(-1)!) as Record<string, unknown>;
}

/** The bot handles what is waiting at the mock Bot API once (`telegram:poll --once`). */
async function pollBot(baseURL: string, tgApiBase: string): Promise<{ handled: number }> {
  const out = await workerCli(['src/cli/telegram-poll.ts', '--once'], workerEnv(baseURL, { TELEGRAM_API_BASE: tgApiBase }));
  return JSON.parse(out.trim().split('\n').at(-1)!) as { handled: number };
}

let fx: Fixture;
let push: MockPushService;
let tg: MockTelegram;
const browsers = new Map<string, FakeBrowserSubscription>();
const newEmail = () => `canale-e2e-${Date.now()}-${randomBytes(3).toString('hex')}@pretoscop.test`;
const fakeIp = () => `10.${[0, 1, 2].map(() => randomBytes(1)[0]! % 250).join('.')}`;
test.use({ extraHTTPHeaders: { 'cf-connecting-ip': fakeIp() } });

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/alerte');
  await page.getByLabel('Adresa de email').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();
  await expect(page.getByRole('heading', { name: 'Verifică emailul' })).toBeVisible({ timeout: SLOW });
  const mail = await latestMail(email, since, /autentificare/);
  await page.goto(/(https?:\/\/\S+magic-link\/verify\S+)/.exec(mail.Text)![1]!);
  await expect(page).toHaveURL(/\/alerte$/, { timeout: SLOW });
}

/**
 * Chromium's PushManager would subscribe at Google's push service: the page gets a stand-in that
 * returns the fake browser's subscription instead (kept in localStorage across reloads) and records
 * the applicationServerKey it was given. The service worker itself is the real /sw.js.
 */
async function stubPushManager(page: Page, sub: FakeBrowserSubscription): Promise<void> {
  await page.addInitScript(
    ({ endpoint, p256dh, auth }) => {
      const KEY = 'e2e-push-subscription';
      const toB64Url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const make = () => ({
        endpoint,
        expirationTime: null,
        options: { userVisibleOnly: true },
        getKey: () => null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }),
        unsubscribe: async () => {
          localStorage.removeItem(KEY);
          return true;
        },
      });
      PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
        const key = options?.applicationServerKey as Uint8Array;
        localStorage.setItem(KEY, toB64Url(key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer));
        return make() as unknown as PushSubscription;
      };
      PushManager.prototype.getSubscription = async function () {
        return (localStorage.getItem(KEY) ? make() : null) as unknown as PushSubscription;
      };
      // Headless Chromium reports notifications as denied even after grantPermissions: the person's
      // "Allow" in the browser prompt is part of the stand-in.
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      Notification.requestPermission = async () => 'granted';
    },
    { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
  );
}

async function iphoneNote(browser: Browser, page: Page, baseURL: string): Promise<void> {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  await ctx.addCookies(await page.context().cookies());
  const p = await ctx.newPage();
  // Safari outside a Home Screen app has no PushManager.
  await p.addInitScript(() => {
    delete (window as { PushManager?: unknown }).PushManager;
  });
  await p.goto('/alerte');
  await expect(p.getByTestId('push-ios-note')).toContainText('Adaugă pe ecranul principal');
  await ctx.close();
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.skip(({ isMobile }) => isMobile, 'the channel flows share flags and a fixture: they run once, in the desktop project');

test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return;
  fx = cli<Fixture>('channels-create');
  push = await startMockPushService({ vapidPublicKey: VAPID_PUBLIC, browsers });
  tg = await startMockTelegram({ token: E2E_TELEGRAM.token });
});
test.afterAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return;
  await push?.close();
  await tg?.close();
  if (fx) cli('channels-drop', JSON.stringify(fx.flagsWere));
});

test('web push: consent, browser permission, a test notification, an alert moved to push and delivered encrypted, removal', async ({ page, browser, baseURL }) => {
  const email = newEmail();
  const path = `/push/${randomBytes(6).toString('hex')}`;
  const fake = fakeBrowserKeys(`${push.url}${path}`);
  browsers.set(path, fake);
  await page.context().grantPermissions(['notifications'], { origin: baseURL });
  await stubPushManager(page, fake);
  await login(page, email);

  // An email alert, active at once (logged in with this very address).
  const created = await page.request.post('/api/alerts', { data: { productId: String(fx.productId), email, kind: 'below', target: '1.300', consent: true, consentVersion: 'alertConsent.v1' } });
  expect(await created.json()).toEqual({ ok: true, status: 'active' });

  await page.reload();
  const section = page.getByTestId('channel-push');
  const consent = section.getByRole('checkbox', { name: /Vreau să primesc pe acest dispozitiv notificări/ });
  const enable = section.getByRole('button', { name: 'Activează notificările pe acest dispozitiv' });
  await expect(consent).not.toBeChecked(); // never pre-ticked
  await expect(enable).toBeDisabled();
  await iphoneNote(browser, page, baseURL!);

  await consent.check();
  await enable.click();
  await expect(section.getByTestId('push-device')).toContainText(/Chrome · /, { timeout: SLOW });
  // The page handed the browser our VAPID key; the server stored the subscription with its consent.
  expect(await page.evaluate(() => localStorage.getItem('e2e-push-subscription'))).toBe(VAPID_PUBLIC);
  let s = cli<State>('channels-state', email);
  expect(s.devices).toEqual([expect.objectContaining({ consent_text_version: 'pushConsent.v1', local_endpoint: true })]);
  expect(s.consents).toContainEqual(expect.objectContaining({ purpose: 'alert_push', per_alert: false, text_version: 'pushConsent.v1', confirm_method: 'session', withdraw_method: null }));

  // A test notification, sent by the web server, VAPID-signed and encrypted for this browser only.
  const before = push.received.length;
  await section.getByRole('button', { name: 'Trimite o notificare de test' }).click();
  await expect(section.getByRole('status')).toHaveText('Am trimis o notificare de test.', { timeout: SLOW });
  expect(push.received.slice(before)).toEqual([expect.objectContaining({ path, payload: expect.objectContaining({ title: 'Pretoscop: notificare de test', tag: 'test' }) })]);

  // The alert moves to push: the email consent of the alert is withdrawn, the push consent recorded.
  const card = page.getByTestId('alert-card');
  await card.getByText('Modifică').click();
  await card.getByLabel('Unde te anunțăm').selectOption('push');
  await card.getByRole('button', { name: 'Salvează' }).click();
  await expect(card).toContainText('în browser', { timeout: SLOW });
  s = cli<State>('channels-state', email);
  expect(s.alerts).toEqual([expect.objectContaining({ channel: 'push', status: 'active', consent_text_version: 'pushConsent.v1' })]);
  expect(s.consents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ purpose: 'alert_email', per_alert: true, withdraw_method: 'channel_changed' }),
      expect.objectContaining({ purpose: 'alert_push', per_alert: true, text_version: 'pushConsent.v1', withdraw_method: null }),
    ]),
  );

  // A price drop under the target reaches the browser as an encrypted push (one per alert, no email).
  const sinceDrop = push.received.length;
  cli('channels-price', 'a', '1299');
  const run = await runAlerts(baseURL!, fx.productId, tg.apiBase);
  const got = push.received.slice(sinceDrop);
  expect(got, JSON.stringify({ run, state: cli<State>('channels-state', email) })).toHaveLength(1);
  expect(got[0]!.path).toBe(path);
  expect(got[0]!.payload).toMatchObject({ title: expect.stringMatching(/^Preț mai mic: Căști wireless Testoscop C5/), body: expect.stringContaining('1.299,00 lei la IT Galaxy') });
  expect(got[0]!.payload.url).toBe(`${baseURL}/p/${fx.slug}`);
  expect(got[0]!.headers.topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
  await runAlerts(baseURL!, fx.productId, tg.apiBase); // the same drop again: nothing new
  expect(push.received.length).toBe(sinceDrop + 1);

  // "Elimină" in the device list (a plain form): subscription gone, push alerts paused, consent withdrawn.
  await section.getByRole('button', { name: 'Elimină' }).click();
  await expect(page.getByText('Notificările pe acel dispozitiv sunt oprite.')).toBeVisible({ timeout: SLOW });
  s = cli<State>('channels-state', email);
  expect(s.devices).toEqual([]);
  expect(s.alerts).toEqual([expect.objectContaining({ channel: 'push', status: 'paused', paused_reason: 'channel_unavailable' })]);
  expect(s.consents).toContainEqual(expect.objectContaining({ purpose: 'alert_push', per_alert: false, withdraw_method: 'push_revoked' }));
  cli('channels-price', 'a', '1499');
});

test('Telegram: one-time link with consent, /start, /urmareste, an alert delivered, /alertele, /oprire, export', async ({ page, baseURL }) => {
  const email = newEmail();
  const chat = 900_000 + (randomBytes(2).readUInt16BE(0) % 50_000);
  await login(page, email);
  const section = page.getByTestId('channel-telegram');

  // No consent, no link.
  await section.getByRole('button', { name: 'Conectează Telegram' }).click();
  await expect(page.getByText('Bifează acordul pentru Telegram ca să conectăm contul.')).toBeVisible({ timeout: SLOW });
  await section.getByRole('checkbox', { name: /Vreau să primesc pe Telegram, de la robotul Pretoscop/ }).check();
  await section.getByRole('button', { name: 'Conectează Telegram' }).click();
  const deepLink = section.getByTestId('telegram-deep-link');
  await expect(deepLink).toBeVisible({ timeout: SLOW });
  const href = (await deepLink.getAttribute('href'))!;
  const m = /^https:\/\/t\.me\/PretoscopE2eBot\?start=([A-Za-z0-9_-]{32})$/.exec(href);
  expect(m).not.toBeNull();
  const token = m![1]!;
  expect(page.url()).not.toContain(token); // the token never travels in our URLs
  let s = cli<State>('channels-state', email);
  expect(s).toMatchObject({ tokens: 1, tokensHashed: true, telegram: null });

  // The person presses Start: the bot links the chat and records the Telegram consent.
  tg.push({ message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text: `/start ${token}` } });
  expect(await pollBot(baseURL!, tg.apiBase)).toEqual({ handled: 1 });
  const lastTo = () => tg.sent().filter((x) => x.chat_id === chat).at(-1)!;
  expect(lastTo().text).toContain('contul tău Pretoscop este conectat');
  s = cli<State>('channels-state', email);
  expect(s.telegram).toEqual({ chat_id: String(chat), status: 'active', consent_text_version: 'telegramConsent.v1' });
  expect(s.tokens).toBe(0);
  expect(s.consents).toContainEqual(expect.objectContaining({ purpose: 'alert_telegram', per_alert: false, text_version: 'telegramConsent.v1', confirm_method: 'telegram' }));
  await page.reload();
  await expect(section).toContainText('Conectat din');

  // The same token again: refused.
  tg.push({ message: { message_id: 2, chat: { id: chat + 1, type: 'private' }, from: { id: chat + 1 }, text: `/start ${token}` } });
  await pollBot(baseURL!, tg.apiBase);
  expect(tg.sent().filter((x) => x.chat_id === chat + 1).at(-1)!.text).toContain('a expirat sau a fost folosit');

  // An alert from the bot, then a drop delivered on Telegram.
  tg.push({ message: { message_id: 3, chat: { id: chat, type: 'private' }, from: { id: chat }, text: `/urmareste ${baseURL}/p/${fx.slug} 1.300` } });
  await pollBot(baseURL!, tg.apiBase);
  expect(lastTo().text).toContain('Urmăresc');
  expect(lastTo().text).toContain('1.300,00 lei sau mai jos');
  s = cli<State>('channels-state', email);
  expect(s.alerts).toEqual([expect.objectContaining({ channel: 'telegram', status: 'active', kind: 'below', target_price: '1300.00', confirm_method: 'telegram', consent_text_version: 'telegramConsent.v1' })]);

  cli('channels-price', 'a', '1250');
  const sent = tg.sent().length;
  await runAlerts(baseURL!, fx.productId, tg.apiBase);
  const alertMsg = tg.sent().slice(sent).filter((x) => x.chat_id === chat);
  expect(alertMsg).toHaveLength(1);
  expect(alertMsg[0]!.text).toContain('1.250,00 lei la IT Galaxy');
  expect(alertMsg[0]!.text).toContain('Sub pragul tău de 1.300,00 lei.');
  expect(alertMsg[0]!.reply_markup!.inline_keyboard.flat().map((b) => b.text)).toEqual([expect.stringMatching(/^Vezi oferta la /), 'Oprește alerta']);

  tg.push({ message: { message_id: 4, chat: { id: chat, type: 'private' }, from: { id: chat }, text: '/alertele' } });
  await pollBot(baseURL!, tg.apiBase);
  expect(lastTo().text).toContain('Căști wireless Testoscop C5');

  // /oprire: unlinked, Telegram alerts paused, consent withdrawn; the page offers to connect again.
  tg.push({ message: { message_id: 5, chat: { id: chat, type: 'private' }, from: { id: chat }, text: '/oprire' } });
  await pollBot(baseURL!, tg.apiBase);
  expect(lastTo().text).toContain('Am oprit alertele pe Telegram');
  s = cli<State>('channels-state', email);
  expect(s.telegram).toBeNull();
  expect(s.alerts).toEqual([expect.objectContaining({ channel: 'telegram', status: 'paused' })]);
  expect(s.consents).toContainEqual(expect.objectContaining({ purpose: 'alert_telegram', per_alert: false, withdraw_method: 'telegram' }));
  await page.reload();
  await expect(section.getByRole('button', { name: 'Conectează Telegram' })).toBeVisible();

  // Export: the channels are part of "my data".
  const data = (await (await page.request.get('/api/account/export')).json()) as { telegram: unknown; pushSubscriptions: unknown[] };
  expect(data).toMatchObject({ telegram: null, pushSubscriptions: [] });
  cli('channels-price', 'a', '1499');
});

test('with the flags off nothing is offered or sent; cross-site requests are refused', async ({ page, baseURL }) => {
  cli('channels-flags', JSON.stringify({ 'alerts.push.enabled': false, 'alerts.telegram.enabled': false }));
  try {
    const email = newEmail();
    await login(page, email);
    await expect(page.getByTestId('channel-push')).toContainText('Notificările în browser pornesc în curând.');
    await expect(page.getByTestId('channel-telegram')).toContainText('Alertele pe Telegram pornesc în curând.');
    const fake = fakeBrowserKeys('https://fcm.googleapis.com/fcm/send/e2e-flag-off');
    const body = { subscription: { endpoint: fake.endpoint, keys: { p256dh: fake.p256dh, auth: fake.auth } }, consent: true, consentVersion: 'pushConsent.v1' };
    expect((await page.request.post('/api/push/subscribe', { data: body })).status()).toBe(503);
    expect((await page.request.post('/api/push/subscribe', { data: body, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
    expect((await page.request.post('/api/push/test', { headers: { origin: 'https://evil.example' } })).status()).toBe(403);

    // The bot refuses to run with its flag off (and so reads nothing from Telegram).
    const calls = tg.calls.length;
    let status = 0;
    try {
      await pollBot(baseURL!, tg.apiBase);
    } catch (err) {
      status = (err as { status?: number }).status ?? -1;
    }
    expect(status).toBe(2);
    expect(tg.calls.length).toBe(calls);
  } finally {
    cli('channels-flags', JSON.stringify({ 'alerts.push.enabled': true, 'alerts.telegram.enabled': true }));
  }
});

test('push endpoints outside the known push services are refused', async ({ page }) => {
  const email = newEmail();
  await login(page, email);
  const fake = fakeBrowserKeys('https://fcm.googleapis.com/fcm/send/x');
  for (const endpoint of ['https://169.254.169.254/latest/meta-data/', 'https://evil.example/push', 'http://10.0.0.1:8080/push']) {
    const res = await page.request.post('/api/push/subscribe', { data: { subscription: { endpoint, keys: { p256dh: fake.p256dh, auth: fake.auth } }, consent: true, consentVersion: 'pushConsent.v1' } });
    expect(res.status()).toBe(400);
  }
  // Consent is required, with today's text version.
  const ok = { endpoint: fake.endpoint, keys: { p256dh: fake.p256dh, auth: fake.auth } };
  expect((await page.request.post('/api/push/subscribe', { data: { subscription: ok, consent: false, consentVersion: 'pushConsent.v1' } })).status()).toBe(400);
  expect((await page.request.post('/api/push/subscribe', { data: { subscription: ok, consent: true, consentVersion: 'pushConsent.v0' } })).status()).toBe(400);
  expect(cli<State>('channels-state', email).devices).toEqual([]);
});

test('the service worker is never cached and handles no fetches; the manifest allows a Home Screen install', async ({ request }) => {
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toMatch(/javascript/);
  expect(sw.headers()['cache-control']).toContain('no-cache');
  const code = await sw.text();
  expect(code).toContain("addEventListener('push'");
  expect(code).toContain("addEventListener('notificationclick'");
  expect(code).not.toContain("addEventListener('fetch'"); // never serves pages: nothing can go stale
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as Record<string, unknown>;
  expect(manifest).toMatchObject({ lang: 'ro', start_url: '/alerte', display: 'standalone', short_name: 'Pretoscop' });
  const icon = await request.get('/apple-icon');
  expect(icon.headers()['content-type']).toBe('image/png');
});
