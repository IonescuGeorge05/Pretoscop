import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import {
  addDaysIso,
  bucharestToday,
  hasDeliveryReceipt,
  createAlert,
  createTelegramLinkToken,
  recordObservation,
  savePushSubscription,
  seedDev,
  setFlag,
  telegramLinkByUser,
} from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { alertLinks, createPushSender, createTelegramClient, generateVapidKeys, type TelegramClient } from '@pretoscop/notify';
import { fakeBrowserKeys, startMockPushService, startMockTelegram, type FakeBrowserSubscription, type MockPushService, type MockTelegram } from '@pretoscop/notify/testing';
import { createPushChannelSender, createTelegramChannelSender } from '../src/alerts/channels';
import { deliverAlerts, type DeliverDeps } from '../src/alerts/deliver';
import { evaluateAlerts } from '../src/alerts/evaluate';
import { createNotifier } from '../src/alerts/notifier';
import { telegramDealsJob } from '../src/jobs/telegram';
import type { JobContext } from '../src/jobs/types';
import { createChatLimiter, handleUpdate, parseFollowArgs, productIdFromText, STALE_AFTER_SEC, type BotDeps } from '../src/telegram/bot';
import { pollOnce, startTelegramPoller } from '../src/telegram/poller';

const SECRET = 'channels-test-secret-0123456789';
const BASE = 'https://pretoscop.test';
const log = createLogger('test', { level: 'silent' });
const links = alertLinks(SECRET, BASE);
const NOON = new Date('2026-11-06T10:00:00Z'); // daytime in Romania: no quiet hours
const vapid = generateVapidKeys();
const browsers = new Map<string, FakeBrowserSubscription>();

let t: TestDatabase;
let tgMock: MockTelegram;
let pushMock: MockPushService;
let telegram: TelegramClient;
let shop: number;
let n = 0;

const limiter = createChatLimiter(1000);
const bot = (): BotDeps => ({ db: t.db, telegram, links, secret: SECRET, log, limiter });
const deliverDeps = (): DeliverDeps => ({
  db: t.db,
  notifier: createNotifier({
    telegram: createTelegramChannelSender(t.db, telegram, log),
    push: createPushChannelSender(t.db, createPushSender({ ...vapid, subject: 'mailto:alerte@pretoscop.ro', allowLocalEndpoints: true }), log),
  }),
  links,
  operator: { name: 'Pretoscop (test)', address: 'România', website: BASE },
  secret: SECRET,
  log,
});

async function product(title = `Produs canal ${++n}`): Promise<{ id: number; slug: string }> {
  const slug = `produs-canal-${++n}`;
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii) VALUES (${slug}, ${title}, ${title.toLowerCase()}) RETURNING id::text`);
  const id = Number(r.rows[0]!.id);
  await t.db.execute(sql`UPDATE products SET slug = ${`${slug}-${id}`} WHERE id = ${id}`);
  return { id, slug: `${slug}-${id}` };
}

async function observe(productId: number, key: string, lei: number, observedAt = new Date()): Promise<number> {
  const priceBani = Math.round(lei * 100);
  const r = await recordObservation(t.db, {
    shopId: shop,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId: key,
    url: `https://example.ro/${key}`,
    titleRaw: key,
    priceBani,
    shippingBani: 0,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    sellerType: 'shop',
    contentHash: createHash('sha256').update(`${key}|${priceBani}`).digest('hex'),
    observedAt,
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE id = ${r.offerId}`);
  return r.offerId!;
}

async function user(): Promise<{ id: string; email: string }> {
  const id = randomBytes(12).toString('hex');
  const email = `canal-${++n}@pretoscop.test`;
  await t.db.execute(sql`INSERT INTO users (id, email, email_verified) VALUES (${id}, ${email}, true)`);
  return { id, email };
}

let chatSeq = 5000;
async function linkedChat(u: { id: string }): Promise<number> {
  const chat = ++chatSeq;
  const token = randomBytes(18).toString('base64url');
  await createTelegramLinkToken(t.db, u.id, token, 'telegramConsent.v1');
  await handleUpdate(bot(), { update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, text: `/start ${token}` } });
  return chat;
}

const say = (chat: number, text: string) => handleUpdate(bot(), { update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, text } });
const lastTo = (chat: number) => tgMock.sent().filter((m) => m.chat_id === chat).at(-1);

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  shop = Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'dedeman'`)).rows[0]!.id);
  tgMock = await startMockTelegram();
  pushMock = await startMockPushService({ vapidPublicKey: vapid.publicKey, browsers });
  telegram = createTelegramClient({ token: tgMock.token, apiBase: tgMock.apiBase, chatIntervalMs: 0, globalIntervalMs: 0 });
  await setFlag(t.db, 'alerts.telegram.enabled', true);
});
afterAll(async () => {
  await tgMock?.close();
  await pushMock?.close();
  await t?.drop();
});

describe('Telegram bot', () => {
  it('parses Pretoscop links and an optional trailing target', () => {
    expect(productIdFromText('https://pretoscop.ro/p/telefon-x1-123')).toBe(123);
    expect(productIdFromText('/p/telefon-x1-123?ref=a')).toBe(123);
    expect(productIdFromText('iphone 17')).toBeNull();
    expect(parseFollowArgs('https://pretoscop.ro/p/x-12 1.999')).toEqual({ what: 'https://pretoscop.ro/p/x-12', target: '1.999' });
    expect(parseFollowArgs('iphone 17 pro 256')).toEqual({ what: 'iphone 17 pro', target: '256' });
    expect(parseFollowArgs('iphone 17 pro')).toEqual({ what: 'iphone 17 pro', target: null });
  });

  it('/start with the one-time token links the chat and records the Telegram consent; the token works once', async () => {
    const u = await user();
    const chat = ++chatSeq;
    const token = randomBytes(18).toString('base64url');
    await createTelegramLinkToken(t.db, u.id, token, 'telegramConsent.v1');
    await say(chat, `/start ${token}`);
    expect(lastTo(chat)?.text).toContain('contul tău Pretoscop este conectat');
    expect(lastTo(chat)?.text).toContain('Dacă nu tu ai cerut conectarea, trimite /oprire.');
    expect(await telegramLinkByUser(t.db, u.id)).toMatchObject({ chatId: chat, status: 'active', consentTextVersion: 'telegramConsent.v1' });
    const c = await t.db.execute<{ purpose: string; confirm_method: string; confirmed: boolean }>(
      sql`SELECT purpose, confirm_method, confirmed_at IS NOT NULL AS confirmed FROM consent_records WHERE user_id = ${u.id}`,
    );
    expect(c.rows).toEqual([{ purpose: 'alert_telegram', confirm_method: 'telegram', confirmed: true }]);
    // The same update seen again (a restart before the acknowledgement): the chat is told it is linked.
    await say(chat, `/start ${token}`);
    expect(lastTo(chat)?.text).toContain('este deja conectat aici');
    // Another chat with the used token: refused, and nothing changes.
    await say(chat + 1, `/start ${token}`);
    expect(lastTo(chat + 1)?.text).toContain('a expirat sau a fost folosit');
    expect(await telegramLinkByUser(t.db, u.id)).toMatchObject({ chatId: chat });
    // Something that is no token of ours never reaches the database lookup.
    await say(chat + 2, '/start not-a-token!');
    expect(lastTo(chat + 2)?.text).toContain('a expirat sau a fost folosit');
  });

  it('a chat that is not linked gets the way to link it, never an alert', async () => {
    await say(4242, '/urmareste iphone');
    expect(lastTo(4242)?.text).toContain('nu este conectat');
  });

  it('/urmareste <link> <price> starts a Telegram alert under the current total; a too-high price is explained', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const p = await product();
    await observe(p.id, `tg-a-${p.id}`, 1500);
    await say(chat, `/urmareste ${BASE}/p/${p.slug} 1.600`);
    expect(lastTo(chat)?.text).toContain('este deja sub');
    await say(chat, `/urmareste ${BASE}/p/${p.slug} 1.400`);
    expect(lastTo(chat)?.text).toContain('Urmăresc');
    expect(lastTo(chat)?.text).toContain('1.400,00 lei sau mai jos');
    const a = await t.db.execute<{ channel: string; kind: string; target: string; status: string; confirm_method: string; consent_text_version: string }>(sql`
      SELECT channel, kind, target_price::text AS target, status, confirm_method, consent_text_version FROM alerts WHERE user_id = ${u.id}`);
    expect(a.rows).toEqual([{ channel: 'telegram', kind: 'below', target: '1400.00', status: 'active', confirm_method: 'telegram', consent_text_version: 'telegramConsent.v1' }]);
  });

  it('/urmareste <words> offers matching products; a tap follows one; /alertele lists and stops', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const p = await product('Consolă Testoscop Q9 Pro');
    await observe(p.id, `tg-b-${p.id}`, 2000);
    await say(chat, '/urmareste testoscop q9');
    const offer = lastTo(chat)!;
    expect(offer.text).toContain('Pe care îl urmăresc?');
    const button = offer.reply_markup!.inline_keyboard[0]![0]!;
    expect(button.callback_data).toBe(`f:${p.id}`);
    await handleUpdate(bot(), { update_id: 2, callback_query: { id: 'cb1', from: { id: chat }, message: { message_id: 9, chat: { id: chat, type: 'private' } }, data: button.callback_data } });
    expect(lastTo(chat)?.text).toContain('la orice scădere de cel puțin 1%');
    await say(chat, '/alertele');
    const list = lastTo(chat)!;
    expect(list.text).toContain('Consolă Testoscop Q9 Pro');
    const stop = list.reply_markup!.inline_keyboard[0]![0]!.callback_data!;
    await handleUpdate(bot(), { update_id: 3, callback_query: { id: 'cb2', from: { id: chat }, message: { message_id: 10, chat: { id: chat, type: 'private' } }, data: stop } });
    expect((await t.db.execute(sql`SELECT 1 FROM alerts WHERE user_id = ${u.id}`)).rows).toHaveLength(0);
    // Another user's alert id cannot be stopped from this chat.
    const other = await user();
    const { alertId } = await createAlert(t.db, { userId: other.id, productId: p.id, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'alertConsent.v1', emailHash: null, confirm: { method: 'session', ipHash: null } });
    await handleUpdate(bot(), { update_id: 4, callback_query: { id: 'cb3', from: { id: chat }, message: { message_id: 11, chat: { id: chat, type: 'private' } }, data: `d:${alertId}` } });
    expect((await t.db.execute(sql`SELECT 1 FROM alerts WHERE id = ${alertId}`)).rows).toHaveLength(1);
  });

  it('alerts arrive on Telegram; a bot blocked by the person pauses its Telegram alerts', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const p = await product();
    await observe(p.id, `tg-c-${p.id}`, 1000);
    await say(chat, `/urmareste ${BASE}/p/${p.slug}`);
    await observe(p.id, `tg-c-${p.id}`, 900);
    await evaluateAlerts(t.db, { productIds: [p.id], channels: ['telegram'], now: NOON });
    const r = await deliverAlerts(deliverDeps(), { channels: ['telegram'], now: NOON });
    expect(r.sent).toBe(1);
    const msg = lastTo(chat)!;
    expect(msg.text).toContain('900,00 lei la Dedeman');
    expect(msg.text).toContain('Cu 10% sub 1.000,00 lei, prețul de la pornirea alertei.');
    expect(msg.reply_markup!.inline_keyboard[1]![0]!.text).toBe('Oprește alerta');

    tgMock.blocked.add(chat);
    await observe(p.id, `tg-c-${p.id}`, 700);
    await t.db.execute(sql`UPDATE alerts SET last_notified_at = now() - interval '25 hours' WHERE user_id = ${u.id}`);
    await evaluateAlerts(t.db, { productIds: [p.id], channels: ['telegram'], now: NOON });
    const r2 = await deliverAlerts(deliverDeps(), { channels: ['telegram'], now: NOON });
    expect(r2.failed).toBe(1);
    expect((await telegramLinkByUser(t.db, u.id))?.status).toBe('blocked');
    const a = await t.db.execute<{ status: string; paused_reason: string }>(sql`SELECT status, paused_reason FROM alerts WHERE user_id = ${u.id}`);
    expect(a.rows[0]).toEqual({ status: 'paused', paused_reason: 'channel_unavailable' });

    // Unblocked and /start again in the same chat: the link and its alerts work again.
    tgMock.blocked.delete(chat);
    await say(chat, '/start');
    expect(lastTo(chat)?.text).toContain('Bine ai revenit');
    expect((await telegramLinkByUser(t.db, u.id))?.status).toBe('active');
    const b = await t.db.execute<{ status: string; paused_reason: string | null }>(sql`SELECT status, paused_reason FROM alerts WHERE user_id = ${u.id}`);
    expect(b.rows[0]).toEqual({ status: 'active', paused_reason: null });
  });

  it('push and Telegram wait for the morning; email does not', async () => {
    const u = await user();
    await linkedChat(u);
    const p = await product();
    await observe(p.id, `tg-q-${p.id}`, 500);
    await createAlert(t.db, { userId: u.id, productId: p.id, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'telegram', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'telegramConsent.v1', emailHash: null, confirm: { method: 'telegram', ipHash: null } });
    await observe(p.id, `tg-q-${p.id}`, 450);
    await evaluateAlerts(t.db, { productIds: [p.id], channels: ['telegram'], now: NOON });
    const night = new Date('2026-11-06T21:30:00Z'); // 23:30 in Bucharest
    expect((await deliverAlerts(deliverDeps(), { channels: ['telegram'], now: night })).messages).toBe(0);
    expect((await deliverAlerts(deliverDeps(), { channels: ['telegram'], now: NOON })).sent).toBe(1);
  });

  it('/oprire unlinks the chat, pauses Telegram alerts and withdraws the consent', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const p = await product();
    await observe(p.id, `tg-d-${p.id}`, 300);
    await say(chat, `/urmareste ${BASE}/p/${p.slug}`);
    await say(chat, '/oprire');
    expect(lastTo(chat)?.text).toContain('Am oprit alertele pe Telegram');
    expect(await telegramLinkByUser(t.db, u.id)).toBeNull();
    const a = await t.db.execute<{ status: string }>(sql`SELECT status FROM alerts WHERE user_id = ${u.id}`);
    expect(a.rows).toEqual([{ status: 'paused' }]);
    const c = await t.db.execute<{ withdraw_method: string | null }>(sql`SELECT withdraw_method FROM consent_records WHERE user_id = ${u.id} AND purpose = 'alert_telegram'`);
    expect(c.rows[0]!.withdraw_method).toBe('telegram');
  });

  it('ignores updates older than 15 minutes (the bot was off) and a chat flooding the bot', async () => {
    const chat = ++chatSeq;
    const old = Math.floor(Date.now() / 1000) - STALE_AFTER_SEC - 60;
    await handleUpdate(bot(), { update_id: 1, message: { message_id: 1, date: old, chat: { id: chat, type: 'private' }, text: '/ajutor' } });
    expect(lastTo(chat)).toBeUndefined();
    const strict = createChatLimiter(3);
    for (let i = 0; i < 6; i++) await handleUpdate({ ...bot(), limiter: strict }, { update_id: 10 + i, message: { message_id: 1, chat: { id: chat, type: 'private' }, text: '/ajutor' } });
    expect(tgMock.sent().filter((m) => m.chat_id === chat)).toHaveLength(3);
    // Group chats are never served.
    await handleUpdate(bot(), { update_id: 30, message: { message_id: 1, chat: { id: -100123, type: 'supergroup' }, text: '/ajutor' } });
    expect(lastTo(-100123)).toBeUndefined();
  });

  it('a button pressed by someone else than the chat owner does nothing', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const p = await product();
    await observe(p.id, `tg-btn-${p.id}`, 100);
    const before = (await t.db.execute(sql`SELECT count(*)::text AS n FROM alerts WHERE user_id = ${u.id}`)).rows[0];
    await handleUpdate(bot(), { update_id: 5, callback_query: { id: 'x1', from: { id: chat + 1 }, message: { message_id: 1, chat: { id: chat, type: 'private' } }, data: `f:${p.id}` } });
    expect((await t.db.execute(sql`SELECT count(*)::text AS n FROM alerts WHERE user_id = ${u.id}`)).rows[0]).toEqual(before);
  });

  it('a retry of a message Telegram already accepted sends nothing (receipt per idempotency key)', async () => {
    const u = await user();
    const chat = await linkedChat(u);
    const sender = createTelegramChannelSender(t.db, telegram, log);
    const message = { title: 'Preț mai mic', body: '1.000,00 lei', url: `${BASE}/p/x-1`, idempotencyKey: `alert-sends-test-${chat}` };
    expect(await sender(u.id, message)).toMatchObject({ ok: true });
    const count = () => tgMock.sent().filter((m) => m.chat_id === chat).length;
    const sent = count();
    expect(await sender(u.id, message)).toEqual({ ok: true, id: 'tg:already-sent' });
    expect(count()).toBe(sent);
    expect(await hasDeliveryReceipt(t.db, message.idempotencyKey, 'telegram')).toBe(true);
  });

  it('with the flag off the poller reads nothing (no getUpdates); --once handles waiting updates and acknowledges them', async () => {
    const calls = () => tgMock.calls.filter((c) => c.method === 'getUpdates').length;
    const before = calls();
    let on = false;
    const p = startTelegramPoller({ pool: t.pool, telegram, handle: async () => undefined, log, lockRetryMs: 50, pollTimeoutSec: 0, flagCheckMs: 50, enabled: async () => on });
    await new Promise((r) => setTimeout(r, 300));
    expect(calls()).toBe(before);
    on = true;
    await new Promise((r) => setTimeout(r, 300));
    expect(calls()).toBeGreaterThan(before);
    // pollOnce refuses while the poller holds the lock.
    expect(await pollOnce({ pool: t.pool, telegram, handle: async () => undefined })).toEqual({ busy: true });
    await p.stop();
    const seen: number[] = [];
    tgMock.push({ message: { message_id: 3, chat: { id: 77, type: 'private' }, text: '/ajutor' } });
    tgMock.push({ message: { message_id: 4, chat: { id: 77, type: 'private' }, text: '/ajutor' } });
    expect(await pollOnce({ pool: t.pool, telegram, handle: async (u) => void seen.push(u.update_id) })).toEqual({ handled: 2 });
    expect(seen).toHaveLength(2);
    expect(await pollOnce({ pool: t.pool, telegram, handle: async (u) => void seen.push(u.update_id) })).toEqual({ handled: 0 });
  });

  it('only one poller consumes updates at a time (advisory lock); the other takes over when it stops', async () => {
    const seen: string[] = [];
    const a = startTelegramPoller({ pool: t.pool, telegram, handle: async (u) => void seen.push(`a:${u.update_id}`), log, lockRetryMs: 100, pollTimeoutSec: 0 });
    await new Promise((r) => setTimeout(r, 300));
    const b = startTelegramPoller({ pool: t.pool, telegram, handle: async (u) => void seen.push(`b:${u.update_id}`), log, lockRetryMs: 100, pollTimeoutSec: 0 });
    tgMock.push({ message: { message_id: 1, chat: { id: 1, type: 'private' }, text: '/ajutor' } });
    await new Promise((r) => setTimeout(r, 500));
    expect(seen.length).toBe(1);
    expect(seen[0]!.startsWith('a:')).toBe(true);
    await a.stop();
    tgMock.push({ message: { message_id: 2, chat: { id: 1, type: 'private' }, text: '/ajutor' } });
    await new Promise((r) => setTimeout(r, 800));
    expect(seen.some((s) => s.startsWith('b:'))).toBe(true);
    await b.stop();
  });
});

describe('Web Push delivery', () => {
  it('delivers to every browser of the user; an expired one is removed, and with none left push alerts pause', async () => {
    const u = await user();
    const p = await product();
    await observe(p.id, `push-a-${p.id}`, 800);
    const b1 = fakeBrowserKeys(`${pushMock.url}/push/${u.id}/1`);
    const b2 = fakeBrowserKeys(`${pushMock.url}/push/${u.id}/2`);
    browsers.set(`/push/${u.id}/1`, b1);
    browsers.set(`/push/${u.id}/2`, b2);
    for (const b of [b1, b2]) await savePushSubscription(t.db, { userId: u.id, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth, deviceLabel: 'Chrome · Android', consentTextVersion: 'pushConsent.v1', emailHash: null, ipHash: 'ip' });
    await createAlert(t.db, { userId: u.id, productId: p.id, kind: 'below', targetBani: 75_000, anyVariant: false, channel: 'push', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'pushConsent.v1', emailHash: null, confirm: { method: 'session', ipHash: null } });
    await observe(p.id, `push-a-${p.id}`, 740);
    pushMock.failNext(`/push/${u.id}/2`, 410);
    await evaluateAlerts(t.db, { productIds: [p.id], channels: ['push'], now: NOON });
    expect((await deliverAlerts(deliverDeps(), { channels: ['push'], now: NOON })).sent).toBe(1);
    const got = pushMock.received.filter((x) => x.path === `/push/${u.id}/1`).at(-1)!;
    expect(got.payload).toMatchObject({ title: expect.stringMatching(/^Preț mai mic: /), body: expect.stringContaining('740,00 lei la Dedeman'), url: `${BASE}/p/${p.slug}` });
    const left = await t.db.execute<{ endpoint: string }>(sql`SELECT endpoint FROM push_subscriptions WHERE user_id = ${u.id}`);
    expect(left.rows.map((r) => r.endpoint)).toEqual([b1.endpoint]);

    browsers.delete(`/push/${u.id}/1`); // the last browser is gone too (404)
    await observe(p.id, `push-a-${p.id}`, 700);
    await t.db.execute(sql`UPDATE alerts SET last_notified_at = now() - interval '25 hours' WHERE user_id = ${u.id}`);
    await evaluateAlerts(t.db, { productIds: [p.id], channels: ['push'], now: NOON });
    expect((await deliverAlerts(deliverDeps(), { channels: ['push'], now: NOON })).failed).toBe(1);
    const a = await t.db.execute<{ status: string }>(sql`SELECT status FROM alerts WHERE user_id = ${u.id}`);
    expect(a.rows).toEqual([{ status: 'paused' }]);
  });

  it('a retry skips the browsers that already got the message and sends the Topic header', async () => {
    const u = await user();
    const b1 = fakeBrowserKeys(`${pushMock.url}/push/${u.id}/r1`);
    const b2 = fakeBrowserKeys(`${pushMock.url}/push/${u.id}/r2`);
    browsers.set(`/push/${u.id}/r1`, b1);
    browsers.set(`/push/${u.id}/r2`, b2);
    for (const b of [b1, b2]) await savePushSubscription(t.db, { userId: u.id, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth, deviceLabel: null, consentTextVersion: 'pushConsent.v1', emailHash: null, ipHash: null });
    const sender = createPushChannelSender(t.db, createPushSender({ ...vapid, subject: 'mailto:alerte@pretoscop.ro', allowLocalEndpoints: true }), log);
    const message = { title: 'Preț mai mic', body: '700,00 lei', url: `${BASE}/p/x-2`, idempotencyKey: `alert-sends-push-${u.id}` };
    pushMock.failNext(`/push/${u.id}/r2`, 503);
    expect(await sender(u.id, message)).toMatchObject({ ok: true });
    const to = (path: string) => pushMock.received.filter((x) => x.path === path);
    expect(to(`/push/${u.id}/r1`)).toHaveLength(1);
    expect(to(`/push/${u.id}/r2`)).toHaveLength(0);
    expect(to(`/push/${u.id}/r1`)[0]!.headers.topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    await sender(u.id, message); // the retry
    expect(to(`/push/${u.id}/r1`)).toHaveLength(1);
    expect(to(`/push/${u.id}/r2`)).toHaveLength(1);
  });

  it('a stored endpoint outside the known push services is never called and is removed', async () => {
    const u = await user();
    await t.db.execute(sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, consent_at, consent_text_version)
      VALUES (${u.id}, 'https://169.254.169.254/latest/meta-data', ${fakeBrowserKeys('x').p256dh}, 'AAAAAAAAAAAAAAAAAAAAAA', now(), 'pushConsent.v1')`);
    const sender = createPushChannelSender(t.db, createPushSender({ ...vapid, subject: 'mailto:alerte@pretoscop.ro' }), log);
    expect(await sender(u.id, { title: 't', body: 'b', url: BASE })).toMatchObject({ ok: false, permanent: true });
    expect((await t.db.execute(sql`SELECT 1 FROM push_subscriptions WHERE user_id = ${u.id}`)).rows).toHaveLength(0);
  });
});

describe('daily deals post', () => {
  const daily = async (productId: number, fromDaysAgo: number, toDaysAgo: number, lei: number) => {
    const today = bucharestToday();
    for (let d = fromDaysAgo; d >= toDaysAgo; d--) {
      await t.db.execute(sql`INSERT INTO product_daily (product_id, day, min_total_price, offer_count, in_stock_count) VALUES (${productId}, ${addDaysIso(today, -d)}::date, ${lei}, 1, 1)`);
    }
  };
  const stats = (productId: number, offerId: number, lei: number, days: number) =>
    t.db.execute(sql`
      INSERT INTO product_stats (product_id, current_min_total, current_min_offer_id, observations_days, median_90d, verdict)
      VALUES (${productId}, ${lei}, ${offerId}, ${days}, 2400, 'good_price')`);

  it('posts the verified drops of the day (M15 rules) once a day, and nothing on a day without them', async () => {
    await setFlag(t.db, 'telegram.deals.enabled', true);
    const env = { ...getEnv({}), TELEGRAM_DEALS_CHAT_ID: '@pretoscop_test' };
    const ctx = { db: t.db, env, log, services: { alerts: { telegram, links } } } as unknown as JobContext;
    const run = (id: string) => telegramDealsJob.handler({ id, name: 'telegram.deals', data: {} } as never, ctx);
    const posts = () => tgMock.sent().filter((m) => m.chat_id === '@pretoscop_test');

    // No drop yet: no post, and the day is not claimed.
    await run('j0');
    expect(posts()).toHaveLength(0);
    expect((await t.db.execute(sql`SELECT 1 FROM channel_posts WHERE channel = 'telegram:deals'`)).rows).toHaveLength(0);

    // A drop that started today: 20 observed days at 2.400 lei, 2.000 lei now.
    const p = await product('Televizor Testoscop 55" QLED');
    await daily(p.id, 20, 1, 2400);
    await stats(p.id, await observe(p.id, `deal-${p.id}`, 2000), 2000, 20);
    // Not posted: under 14 observed days (no badge), and a drop that started three days ago.
    const young = await product('Produs cu istoric scurt');
    await daily(young.id, 10, 1, 2400);
    await stats(young.id, await observe(young.id, `deal-young-${young.id}`, 2000), 2000, 20);
    const old = await product('Produs redus de trei zile');
    await daily(old.id, 25, 4, 2400);
    await daily(old.id, 3, 1, 2000);
    await stats(old.id, await observe(old.id, `deal-old-${old.id}`, 2000), 2000, 25);

    await run('j1');
    await run('j2'); // delivered twice
    expect(posts()).toHaveLength(1);
    const text = posts()[0]!.text;
    expect(text).toContain('Televizor Testoscop 55&quot; QLED');
    expect(text).toContain('2.000,00 lei la Dedeman · cu 16% sub minimul din 30 de zile (2.400,00 lei)');
    expect(text).toContain(`${BASE}/p/${p.slug}`);
    expect(text).toContain('/reduceri">Toate reducerile</a>');
    expect(text).not.toContain('Produs cu istoric scurt');
    expect(text).not.toContain('Produs redus de trei zile');
    expect(text).not.toContain('/out/');
  });
});
