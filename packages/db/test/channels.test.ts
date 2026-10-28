import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  consumeTelegramLinkToken,
  createAlert,
  createTelegramLinkToken,
  deleteEmptyAccounts,
  deletePushSubscription,
  deleteUserData,
  exportUserData,
  hasDeliveryReceipt,
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  pruneDeliveryReceipts,
  pruneTelegramLinkTokens,
  recordDeliveryReceipt,
  savePushSubscription,
  telegramLinkByUser,
  telegramTokenHash,
  unlinkTelegram,
  updateAlert,
  userPushDevices,
  usersDueRetentionNotice,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

// M27 channel queries: push subscriptions, Telegram links and tokens, receipts, and how they meet
// the M19 rules (consent ledger, retention, export and deletion).

let t: TestDatabase;
let n = 0;

async function user(): Promise<string> {
  const id = randomBytes(12).toString('hex');
  await t.db.execute(sql`INSERT INTO users (id, email, email_verified) VALUES (${id}, ${`canal${++n}@pretoscop.test`}, true)`);
  return id;
}

async function product(): Promise<number> {
  const slug = `canal-p-${++n}`;
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii) VALUES (${slug}, ${`Produs ${n}`}, ${slug}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

const sub = (userId: string, i = ++n) => ({
  userId,
  endpoint: `https://fcm.googleapis.com/fcm/send/test-${i}`,
  p256dh: `B${'A'.repeat(86)}`,
  auth: 'A'.repeat(22),
  deviceLabel: 'Chrome · Android',
  consentTextVersion: 'pushConsent.v1',
  emailHash: null,
  ipHash: 'a'.repeat(32),
});

const consents = async (userId: string) =>
  (
    await t.db.execute<{ purpose: string; alert_id: string | null; text_version: string; confirm_method: string | null; withdraw_method: string | null }>(sql`
      SELECT purpose, alert_id::text, text_version, confirm_method, withdraw_method FROM consent_records WHERE user_id = ${userId} ORDER BY id`)
  ).rows;

async function linkTelegram(userId: string, chatId: number): Promise<void> {
  const token = randomBytes(24).toString('base64url');
  await createTelegramLinkToken(t.db, userId, token, 'telegramConsent.v1');
  expect(await consumeTelegramLinkToken(t.db, telegramTokenHash(token), chatId, () => 'h'.repeat(64))).toMatchObject({ userId });
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe('push subscriptions', () => {
  it('stores the consent with the subscription and in the ledger; the last one removed pauses push alerts and withdraws it', async () => {
    const u = await user();
    const p = await product();
    const id = await savePushSubscription(t.db, sub(u));
    await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'push', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'pushConsent.v1', emailHash: null, confirm: { method: 'session', ipHash: null } });
    expect(await userPushDevices(t.db, u)).toEqual([expect.objectContaining({ id, deviceLabel: 'Chrome · Android', consentTextVersion: 'pushConsent.v1' })]);
    expect((await userPushDevices(t.db, u))[0]).not.toHaveProperty('endpoint');
    expect(await consents(u)).toContainEqual(expect.objectContaining({ purpose: 'alert_push', alert_id: null, text_version: 'pushConsent.v1', confirm_method: 'session' }));

    expect(await deletePushSubscription(t.db, { userId: 'someone-else', id }, 'push_revoked')).toBe(false);
    expect(await deletePushSubscription(t.db, { userId: u, id }, 'push_revoked')).toBe(true);
    const a = await t.db.execute<{ status: string; paused_reason: string }>(sql`SELECT status, paused_reason FROM alerts WHERE user_id = ${u}`);
    expect(a.rows).toEqual([{ status: 'paused', paused_reason: 'channel_unavailable' }]);
    expect(await consents(u)).toContainEqual(expect.objectContaining({ purpose: 'alert_push', alert_id: null, withdraw_method: 'push_revoked' }));

    // Subscribing again resumes them.
    await savePushSubscription(t.db, sub(u));
    expect((await t.db.execute<{ status: string }>(sql`SELECT status FROM alerts WHERE user_id = ${u}`)).rows).toEqual([{ status: 'active' }]);
  });

  it('keeps at most 10 browsers per account (the newest)', async () => {
    const u = await user();
    for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS_PER_USER + 3; i++) await savePushSubscription(t.db, sub(u, 9000 + n + i));
    expect(await userPushDevices(t.db, u)).toHaveLength(MAX_PUSH_SUBSCRIPTIONS_PER_USER);
  });

  it('an endpoint subscribed by another account moves to it (same browser, another login)', async () => {
    const a = await user();
    const b = await user();
    const s = sub(a);
    await savePushSubscription(t.db, s);
    await savePushSubscription(t.db, { ...s, userId: b });
    expect(await userPushDevices(t.db, a)).toEqual([]);
    expect(await userPushDevices(t.db, b)).toHaveLength(1);
    expect(await consents(a)).toContainEqual(expect.objectContaining({ purpose: 'alert_push', withdraw_method: 'replaced' }));
  });
});

describe('Telegram links', () => {
  it('a token works once, only for 15 minutes, and only its hash is stored', async () => {
    const u = await user();
    const token = randomBytes(24).toString('base64url');
    await createTelegramLinkToken(t.db, u, token, 'telegramConsent.v1');
    const stored = await t.db.execute<{ token_hash: string }>(sql`SELECT token_hash FROM telegram_link_tokens WHERE user_id = ${u}`);
    expect(stored.rows).toEqual([{ token_hash: telegramTokenHash(token) }]);
    expect(stored.rows[0]!.token_hash).not.toContain(token);

    const [first, second] = await Promise.all([
      consumeTelegramLinkToken(t.db, telegramTokenHash(token), 7001, () => 'h'.repeat(64)),
      consumeTelegramLinkToken(t.db, telegramTokenHash(token), 7002, () => 'h'.repeat(64)),
    ]);
    expect([first, second].filter((x) => x !== null)).toHaveLength(1); // one-time, even when raced

    const late = randomBytes(24).toString('base64url');
    await createTelegramLinkToken(t.db, u, late, 'telegramConsent.v1');
    await t.db.execute(sql`UPDATE telegram_link_tokens SET expires_at = now() - interval '1 second' WHERE user_id = ${u}`);
    expect(await consumeTelegramLinkToken(t.db, telegramTokenHash(late), 7003, () => 'h'.repeat(64))).toBeNull();
    expect(await pruneTelegramLinkTokens(t.db)).toBeGreaterThanOrEqual(1);
  });

  it('a new link token replaces the previous one of the same account', async () => {
    const u = await user();
    const a = randomBytes(24).toString('base64url');
    const b = randomBytes(24).toString('base64url');
    await createTelegramLinkToken(t.db, u, a, 'telegramConsent.v1');
    await createTelegramLinkToken(t.db, u, b, 'telegramConsent.v1');
    expect(await consumeTelegramLinkToken(t.db, telegramTokenHash(a), 7101, () => 'h'.repeat(64))).toBeNull();
    expect(await consumeTelegramLinkToken(t.db, telegramTokenHash(b), 7101, () => 'h'.repeat(64))).toMatchObject({ userId: u });
  });

  it('a chat linked by a second account leaves the first one (its Telegram alerts pause, its consent is withdrawn)', async () => {
    const a = await user();
    const b = await user();
    const p = await product();
    await linkTelegram(a, 7201);
    await createAlert(t.db, { userId: a, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'telegram', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'telegramConsent.v1', emailHash: null, confirm: { method: 'telegram', ipHash: null } });
    await linkTelegram(b, 7201);
    expect(await telegramLinkByUser(t.db, a)).toBeNull();
    expect(await telegramLinkByUser(t.db, b)).toMatchObject({ chatId: 7201, status: 'active' });
    expect((await t.db.execute<{ status: string }>(sql`SELECT status FROM alerts WHERE user_id = ${a}`)).rows).toEqual([{ status: 'paused' }]);
    expect(await consents(a)).toContainEqual(expect.objectContaining({ purpose: 'alert_telegram', alert_id: null, withdraw_method: 'replaced' }));
  });
});

describe('channel changes and the consent ledger', () => {
  it('moving an alert to another channel withdraws the old consent record and needs one for the new channel', async () => {
    const u = await user();
    const p = await product();
    await linkTelegram(u, 7301);
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'alertConsent.v1', emailHash: null, confirm: { method: 'session', ipHash: null } });
    await expect(updateAlert(t.db, alertId, u, { kind: 'any_drop', targetBani: null, channel: 'telegram' })).rejects.toThrow(/consent/);
    expect(await updateAlert(t.db, alertId, u, { kind: 'any_drop', targetBani: null, channel: 'telegram', consent: { textVersion: 'telegramConsent.v1', ipHash: null, emailHash: null } })).toBe(true);
    const c = (await consents(u)).filter((x) => x.alert_id === String(alertId));
    expect(c).toEqual([
      expect.objectContaining({ purpose: 'alert_email', withdraw_method: 'channel_changed' }),
      expect.objectContaining({ purpose: 'alert_telegram', text_version: 'telegramConsent.v1', withdraw_method: null }),
    ]);
    // Same channel, no new record.
    expect(await updateAlert(t.db, alertId, u, { kind: 'below', targetBani: 10_000 })).toBe(true);
    expect((await consents(u)).filter((x) => x.alert_id === String(alertId))).toHaveLength(2);
  });

  it('an email alert paused by the suppression list becomes active when it moves to Telegram', async () => {
    const u = await user();
    const p = await product();
    await linkTelegram(u, 7401);
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'alertConsent.v1', emailHash: null, confirm: { method: 'session', ipHash: null } });
    await t.db.execute(sql`UPDATE alerts SET status = 'paused', paused_reason = 'suppressed' WHERE id = ${alertId}`);
    await updateAlert(t.db, alertId, u, { kind: 'any_drop', targetBani: null, channel: 'telegram', consent: { textVersion: 'telegramConsent.v1', ipHash: null, emailHash: null } });
    expect((await t.db.execute<{ status: string; paused_reason: string | null }>(sql`SELECT status, paused_reason FROM alerts WHERE id = ${alertId}`)).rows).toEqual([{ status: 'active', paused_reason: null }]);
  });
});

describe('retention, export and deletion', () => {
  it('an inactive account with only a channel gets the notice; one with nothing left is deleted', async () => {
    const withChat = await user();
    const withBrowser = await user();
    const empty = await user();
    await linkTelegram(withChat, 7501);
    await savePushSubscription(t.db, sub(withBrowser));
    await t.db.execute(sql`UPDATE users SET last_active_at = now() - interval '25 months' WHERE id IN (${withChat}, ${withBrowser}, ${empty})`);
    const due = (await usersDueRetentionNotice(t.db, 24)).map((x) => x.id);
    expect(due).toEqual(expect.arrayContaining([withChat, withBrowser]));
    expect(due).not.toContain(empty);
    await deleteEmptyAccounts(t.db, { unverifiedDays: 7, inactiveMonths: 24 });
    const left = await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE id IN (${withChat}, ${withBrowser}, ${empty})`);
    expect(left.rows.map((r) => r.id).sort()).toEqual([withChat, withBrowser].sort());
  });

  it('the export holds the browsers (no keys) and the Telegram link; deleting the account removes both', async () => {
    const u = await user();
    await linkTelegram(u, 7601);
    await savePushSubscription(t.db, sub(u));
    const data = (await exportUserData(t.db, u, null)) as { pushSubscriptions: Array<Record<string, unknown>>; telegram: Record<string, unknown> | null };
    expect(data.pushSubscriptions).toEqual([expect.objectContaining({ device_label: 'Chrome · Android', consent_text_version: 'pushConsent.v1' })]);
    expect(data.pushSubscriptions[0]).not.toHaveProperty('p256dh');
    expect(data.pushSubscriptions[0]).not.toHaveProperty('auth');
    expect(data.telegram).toMatchObject({ chat_id: '7601', status: 'active', consent_text_version: 'telegramConsent.v1' });

    expect(await deleteUserData(t.db, u, { method: 'account_deleted', emailHash: null })).toBe(true);
    const rows = await t.db.execute<{ n: string }>(sql`
      SELECT ((SELECT count(*) FROM push_subscriptions WHERE user_id = ${u}) + (SELECT count(*) FROM telegram_links WHERE user_id = ${u})
        + (SELECT count(*) FROM telegram_link_tokens WHERE user_id = ${u}))::text AS n`);
    expect(rows.rows[0]!.n).toBe('0');
  });

  it('/oprire unlinks: link gone, consent withdrawn with the method given', async () => {
    const u = await user();
    await linkTelegram(u, 7701);
    expect(await unlinkTelegram(t.db, u, 'telegram')).toBe(true);
    expect(await telegramLinkByUser(t.db, u)).toBeNull();
    expect(await consents(u)).toContainEqual(expect.objectContaining({ purpose: 'alert_telegram', withdraw_method: 'telegram' }));
  });
});

describe('delivery receipts', () => {
  it('records each target once and forgets them after the window', async () => {
    expect(await hasDeliveryReceipt(t.db, 'alert-sends-x', 'telegram')).toBe(false);
    await recordDeliveryReceipt(t.db, 'alert-sends-x', 'telegram', '101');
    await recordDeliveryReceipt(t.db, 'alert-sends-x', 'telegram', '102'); // a second record is a no-op
    expect(await hasDeliveryReceipt(t.db, 'alert-sends-x', 'telegram')).toBe(true);
    expect(await hasDeliveryReceipt(t.db, 'alert-sends-x', 'push:1')).toBe(false);
    await t.db.execute(sql`UPDATE channel_deliveries SET created_at = now() - interval '8 days' WHERE idempotency_key = 'alert-sends-x'`);
    expect(await pruneDeliveryReceipts(t.db, 7)).toBe(1);
    expect(await hasDeliveryReceipt(t.db, 'alert-sends-x', 'telegram')).toBe(false);
  });
});
