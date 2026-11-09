import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dealsPostText, pushAlertPayload, telegramAlertMessage } from '../src/channel-messages';
import type { AlertItem } from '../src/email';
import { createPushSender, generateVapidKeys, parsePushSubscription, pushEndpointProblem, pushTopic } from '../src/push';
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
  const sender = () => createPushSender({ ...keys, subject: 'mailto:alerte@pretoscop.ro', allowLocalEndpoints: true });

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
    const r = await createPushSender({ ...other, subject: 'mailto:alerte@pretoscop.ro', allowLocalEndpoints: true }).send(sub, { title: 't', body: 'b', url: 'u' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('sends the Topic header, so a retry replaces an undelivered copy at the push service', async () => {
    const sub = fakeBrowserKeys(`${push.url}/push/topic`);
    browsers.set('/push/topic', sub);
    const topic = pushTopic('alert-sends-abc');
    expect(topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(pushTopic('alert-sends-abc')).toBe(topic);
    expect(await sender().send(sub, { title: 't', body: 'b', url: 'u' }, { topic })).toMatchObject({ ok: true });
    expect(push.received.at(-1)!.headers.topic).toBe(topic);
  });

  it('never posts to an endpoint outside the known push services (SSRF), whatever the database holds', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called++;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const s = createPushSender({ ...keys, subject: 'mailto:alerte@pretoscop.ro', fetchImpl });
    const sub = fakeBrowserKeys('http://127.0.0.1:1/push/x');
    const refused = [
      'http://127.0.0.1:5432/x',
      'https://169.254.169.254/latest/meta-data',
      'https://internal.example/push',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
      'http://fcm.googleapis.com/fcm/send/x',
    ];
    for (const endpoint of refused) {
      expect(await s.send({ ...sub, endpoint }, { title: 't', body: 'b', url: 'u' })).toMatchObject({ ok: false, gone: true, error: expect.stringMatching(/^endpoint refused/) });
    }
    expect(called).toBe(0);
    expect(await s.send({ ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, { title: 't', body: 'b', url: 'u' })).toEqual({ ok: true, status: 201 });
    expect(called).toBe(1);
  });
});

describe('push endpoints and subscriptions', () => {
  it('accepts the push services of Chrome, Firefox, Safari and Edge only, over https on the default port', () => {
    const accepted = [
      'https://fcm.googleapis.com/fcm/send/dGVzdA:APA91b',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://web.push.apple.com/QGh4Jz',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB',
    ];
    for (const ok of accepted) expect(pushEndpointProblem(ok)).toBeNull();
    expect(pushEndpointProblem('https://evil.example/fcm.googleapis.com')).toBe('unknown_push_service');
    expect(pushEndpointProblem('https://fcm.googleapis.com.evil.example/x')).toBe('unknown_push_service');
    expect(pushEndpointProblem('https://notfcm.googleapis.com/x')).toBe('unknown_push_service');
    expect(pushEndpointProblem('http://fcm.googleapis.com/x')).toBe('not_https');
    expect(pushEndpointProblem('https://fcm.googleapis.com:444/x')).toBe('port');
    expect(pushEndpointProblem(`https://fcm.googleapis.com/${'a'.repeat(1100)}`)).toBe('too_long');
    expect(pushEndpointProblem('not a url')).toBe('not_a_url');
    expect(pushEndpointProblem('http://127.0.0.1:3482/push')).toBe('not_https');
    expect(pushEndpointProblem('http://127.0.0.1:3482/push', { allowLocal: true })).toBeNull();
    expect(pushEndpointProblem('http://10.0.0.5:3482/push', { allowLocal: true })).toBe('not_https');
  });

  it('parses PushSubscription.toJSON(): a P-256 key and a 16-byte secret, padding tolerated', () => {
    const b = fakeBrowserKeys('https://fcm.googleapis.com/fcm/send/abc');
    const keysOf = (p256dh: string, auth: string) => ({ endpoint: b.endpoint, keys: { p256dh, auth } });
    expect(parsePushSubscription(keysOf(b.p256dh, b.auth))).toEqual({ endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth });
    expect(parsePushSubscription(keysOf(`${b.p256dh}=`, `${b.auth}==`))).toEqual({ endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth });
    expect(parsePushSubscription({ endpoint: 'https://evil.example/x', keys: { p256dh: b.p256dh, auth: b.auth } })).toBeNull();
    expect(parsePushSubscription(keysOf(b.p256dh.slice(0, 40), b.auth))).toBeNull();
    expect(parsePushSubscription(keysOf(`C${b.p256dh.slice(1)}`, b.auth))).toBeNull(); // not an uncompressed point
    expect(parsePushSubscription({ endpoint: b.endpoint, keys: { p256dh: b.p256dh } })).toBeNull();
    expect(parsePushSubscription([b.endpoint])).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
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

  it('escapes the HTML characters Telegram parses, quotes included (href values)', () => {
    expect(tgEscape('a < b & c > d "e"')).toBe('a &lt; b &amp; c &gt; d &quot;e&quot;');
  });

  it('after a 429, holds every message for retry_after; a slot too far away fails at once', async () => {
    const c = createTelegramClient({ token: tg.token, apiBase: tg.apiBase, chatIntervalMs: 0, globalIntervalMs: 0, maxWaitMs: 2000 });
    tg.rateLimitNext(1);
    expect(((await c.sendMessage(21, 'x').catch((e: unknown) => e)) as TelegramApiError).code).toBe(429);
    const t0 = Date.now();
    await c.sendMessage(22, 'y'); // another chat waits too: the limit is global
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    tg.rateLimitNext(5);
    await c.sendMessage(23, 'z').catch(() => undefined);
    const before = tg.calls.length;
    const local = (await c.sendMessage(24, 'w').catch((e: unknown) => e)) as TelegramApiError;
    expect(local).toBeInstanceOf(TelegramApiError);
    expect(local).toMatchObject({ code: 429, retryAfterSec: expect.any(Number) });
    expect(tg.calls.length).toBe(before); // nothing was sent
  });

  it('never puts the bot token in an error message', async () => {
    const c = createTelegramClient({ token: '987654:SECRET-token-value', apiBase: 'http://127.0.0.1:1' });
    const err = (await c.getMe().catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/^telegram getMe:/);
    expect(err.message).not.toContain('SECRET-token-value');
    const wrong = createTelegramClient({ token: '987654:SECRET-token-value', apiBase: tg.apiBase });
    const unauthorized = (await wrong.getMe().catch((e: unknown) => e)) as TelegramApiError;
    expect(unauthorized.code).toBe(401);
    expect(unauthorized.message).not.toContain('SECRET-token-value');
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

describe('Telegram length limit (4096 characters)', () => {
  const balanced = (t: string) => {
    for (const tag of ['a', 'b', 'i']) expect(t.split(`<${tag}${tag === 'a' ? ' ' : '>'}`).length).toBe(t.split(`</${tag}>`).length);
  };

  it('a long digest keeps whole blocks, counts the rest and keeps the footer', () => {
    const many = Array.from({ length: 40 }, (_, k) => item({ alertId: 100 + k, productTitle: `Produs cu un titlu foarte lung numărul ${k} ${'x'.repeat(80)}` }));
    const { text } = telegramAlertMessage(many, { manageUrl: 'https://pretoscop.ro/alerte' });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toMatch(/… și încă \d+ alerte în <a href="https:\/\/pretoscop\.ro\/alerte">Alertele mele<\/a>\./);
    expect(text.endsWith('Oprești alertele cu /oprire.')).toBe(true);
    balanced(text);
  });

  it('a long deals post stays under the limit too', () => {
    const drops = Array.from({ length: 10 }, (_, k) => ({
      productTitle: `Televizor ${'y'.repeat(120)} ${k}`,
      productUrl: `https://pretoscop.ro/p/${'televizor-'.repeat(30)}${k}`,
      totalBani: 199_900,
      shopName: 'Magazin cu nume lung '.repeat(5),
      min30Bani: 229_900,
      dropPct: 13,
    }));
    const text = dealsPostText(drops, { date: new Date('2026-11-06T07:15:00Z'), dealsUrl: 'https://pretoscop.ro/reduceri' });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain('pe pagina de reduceri.');
    expect(text).toContain('Toate reducerile</a>');
    balanced(text);
  });
});
