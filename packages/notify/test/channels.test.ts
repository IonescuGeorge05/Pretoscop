import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dealsPostText, pushAlertPayload, telegramAlertMessage } from '../src/channel-messages';
import type { AlertItem } from '../src/email';
import { createPushSender, generateVapidKeys } from '../src/push';
import { createTelegramClient, TelegramApiError, tgEscape } from '../src/telegram';
import { fakeBrowserKeys, startMockPushService, startMockTelegram, type FakeBrowserSubscription, type MockPushService, type MockTelegram } from '../src/testing';

const keys = generateVapidKeys();
const browsers = new Map<string, FakeBrowserSubscription>();
let push: MockPushService;
let tg: MockTelegram;

beforeAll(async () => {
  push = await startMockPushService({ vapidPublicKey: keys.publicKey, browsers });
  tg = await startMockTelegram();
});
afterAll(async () => {
  await push?.close();
  await tg?.close();
});

describe('Web Push (RFC 8291 + 8292, checked by an independent decryptor)', () => {
  const sender = () => createPushSender({ ...keys, subject: 'mailto:alerte@pretoscop.ro' });

  it('delivers an encrypted payload the browser can read, with a valid VAPID JWT', async () => {
    const sub = fakeBrowserKeys(`${push.url}/push/a`);
    browsers.set('/push/a', sub);
    const r = await sender().send(sub, { title: 'Preț mai mic', body: '1.399,00 lei la IT Galaxy', url: 'https://pretoscop.ro/p/x-1', tag: 'alerta-1' }, { urgency: 'high', ttlSec: 3600 });
    expect(r).toEqual({ ok: true, status: 201 });
    const got = push.received.at(-1)!;
    expect(got.payload).toEqual({ title: 'Preț mai mic', body: '1.399,00 lei la IT Galaxy', url: 'https://pretoscop.ro/p/x-1', tag: 'alerta-1' });
    expect(got.headers.ttl).toBe('3600');
    expect(got.headers.urgency).toBe('high');
  });

  it('reports expired subscriptions (404/410) as gone, other failures as retryable', async () => {
    const sub = fakeBrowserKeys(`${push.url}/push/b`);
    browsers.set('/push/b', sub);
    push.failNext('/push/b', 410);
    expect(await sender().send(sub, { title: 't', body: 'b', url: 'u' })).toMatchObject({ ok: false, gone: true, status: 410 });
    push.failNext('/push/b', 503);
    expect(await sender().send(sub, { title: 't', body: 'b', url: 'u' })).toMatchObject({ ok: false, gone: false, status: 503 });
    expect(await sender().send({ ...sub, endpoint: 'http://127.0.0.1:1/push/none' }, { title: 't', body: 'b', url: 'u' })).toMatchObject({ ok: false, gone: false });
    expect(await sender().send({ ...sub, p256dh: 'not-a-key' }, { title: 't', body: 'b', url: 'u' })).toMatchObject({ ok: false, gone: true });
  });

  it('refuses a wrong VAPID key at the push service', async () => {
    const other = generateVapidKeys();
    const sub = fakeBrowserKeys(`${push.url}/push/c`);
    browsers.set('/push/c', sub);
    const r = await createPushSender({ ...other, subject: 'mailto:alerte@pretoscop.ro' }).send(sub, { title: 't', body: 'b', url: 'u' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe('Telegram Bot API client', () => {
  it('sends HTML messages with inline buttons and no link previews', async () => {
    const c = createTelegramClient({ token: tg.token, apiBase: tg.apiBase, chatIntervalMs: 0, globalIntervalMs: 0 });
    expect((await c.getMe()).username).toBe('PretoscopTestBot');
    const m = await c.sendMessage(7, '<b>Salut</b>', { buttons: [[{ text: 'Vezi', url: 'https://pretoscop.ro' }]] });
    expect(m.message_id).toBeGreaterThan(100);
    expect(tg.calls.at(-1)).toEqual({
      method: 'sendMessage',
      body: { chat_id: 7, text: '<b>Salut</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: 'Vezi', url: 'https://pretoscop.ro' }]] } },
    });
  });

  it('maps a blocked chat and rate limits to typed errors', async () => {
    const c = createTelegramClient({ token: tg.token, apiBase: tg.apiBase, chatIntervalMs: 0, globalIntervalMs: 0 });
    tg.blocked.add(99);
    const blocked = await c.sendMessage(99, 'x').catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(TelegramApiError);
    expect((blocked as TelegramApiError).blocked).toBe(true);
    tg.rateLimitNext(7);
    const limited = (await c.sendMessage(8, 'x').catch((e: unknown) => e)) as TelegramApiError;
    expect(limited.code).toBe(429);
    expect(limited.retryAfterSec).toBe(7);
    expect(limited.blocked).toBe(false);
  });

  it('spaces messages to the same chat (one per second by default)', async () => {
    const c = createTelegramClient({ token: tg.token, apiBase: tg.apiBase, chatIntervalMs: 300, globalIntervalMs: 0 });
    const t0 = Date.now();
    await c.sendMessage(5, 'a');
    await c.sendMessage(5, 'b');
    await c.sendMessage(6, 'c'); // another chat is not held back by chat 5
    expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('escapes the three HTML characters Telegram parses', () => {
    expect(tgEscape('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });
});

const item = (over: Partial<AlertItem> = {}): AlertItem => ({
  alertId: 12,
  productTitle: 'Telefon mobil Testoscop X1, 128GB <Negru>',
  productUrl: 'https://pretoscop.ro/p/telefon-mobil-testoscop-x1-1',
  outUrl: 'https://pretoscop.ro/out/55?p=alert',
  shopName: 'IT Galaxy',
  totalBani: 139_900,
  priceBani: 139_900,
  shippingBani: 0,
  shippingEstimated: false,
  checkedAt: new Date('2026-11-06T10:05:00Z'),
  reason: 'below_target',
  referenceBani: 145_000,
  referenceKind: 'target',
  anyVariant: false,
  unsubscribeUrl: 'https://pretoscop.ro/alerte/dezabonare?a=12&t=x',
  affiliate: false,
  ...over,
});

describe('channel message formats (snapshots)', () => {
  it('Telegram alert: facts, escaped title, offer button and a stop button', () => {
    expect(telegramAlertMessage([item()], { manageUrl: 'https://pretoscop.ro/alerte' })).toMatchSnapshot();
    expect(telegramAlertMessage([item(), item({ alertId: 13, productTitle: 'Laptop Y', affiliate: true })], { manageUrl: 'https://pretoscop.ro/alerte' })).toMatchSnapshot();
  });

  it('push payload: one alert opens the product, several open the alerts page', () => {
    expect(pushAlertPayload([item()], { manageUrl: 'https://pretoscop.ro/alerte' })).toMatchSnapshot();
    expect(pushAlertPayload([item(), item({ alertId: 13, productTitle: 'Laptop Y' })], { manageUrl: 'https://pretoscop.ro/alerte', simulated: true })).toMatchSnapshot();
  });

  it('daily deals post: verified drops only, numbers and dates, links to Pretoscop', () => {
    const text = dealsPostText(
      [
        { productTitle: 'Televizor Samsung 55" QLED', productUrl: 'https://pretoscop.ro/p/televizor-samsung-55-7', totalBani: 249_900, shopName: 'forit', min30Bani: 289_900, dropPct: 13 },
        { productTitle: 'Căști Sony WH-1000XM6', productUrl: 'https://pretoscop.ro/p/casti-sony-9', totalBani: 129_900, shopName: 'IT Galaxy', min30Bani: 139_900, dropPct: 7 },
      ],
      { date: new Date('2026-11-06T07:15:00Z'), dealsUrl: 'https://pretoscop.ro/reduceri' },
    );
    expect(text).toMatchSnapshot();
    expect(text).not.toMatch(/[şţ]/);
    expect(text).not.toContain('/out/');
  });
});
