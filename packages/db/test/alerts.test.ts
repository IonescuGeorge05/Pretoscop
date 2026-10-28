import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alertCandidates,
  bestAlertOffer,
  claimAlertNotification,
  claimQueuedSends,
  clearSendCounter,
  confirmAlert,
  createAlert,
  deleteAlert,
  deleteEmptyAccounts,
  deleteExpiredPendingAlerts,
  deleteExpiredVerifications,
  deleteUserData,
  exportUserData,
  finishSends,
  hitSendCounter,
  minimizeClicksAndEvents,
  recoverStuckSends,
  pruneConsentRecords,
  recordObservation,
  repointMergedAlerts,
  seedDev,
  sendsByIds,
  suppressEmail,
  suppressionReason,
  unsubscribeAllEmail,
  updateAlert,
  usersDueRetentionDeletion,
  usersDueRetentionNotice,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let dedeman: number;
let emag: number;
let n = 0;

async function product(familyId: number | null = null): Promise<number> {
  const slug = `p-${++n}`;
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii, family_id) VALUES (${slug}, ${`Produs ${n}`}, ${slug}, ${familyId}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function family(): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO product_families (slug, title) VALUES (${`f-${++n}`}, 'Familie') RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function user(email = `u${++n}@pretoscop.test`): Promise<string> {
  const id = randomBytes(12).toString('hex');
  await t.db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`);
  return id;
}

/** A matched, fresh, in-stock offer at `lei` (+ shipping) for the product. */
async function offer(productId: number, lei: number, extra: Partial<OfferObservation> & { shopId?: number; ageHours?: number } = {}): Promise<number> {
  const priceBani = Math.round(lei * 100);
  const ship = extra.shippingBani ?? 0;
  const externalId = extra.externalId ?? `o-${++n}`;
  const availability = extra.availability ?? 'in_stock';
  const r = await recordObservation(t.db, {
    shopId: extra.shopId ?? dedeman,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url: `https://example.ro/${externalId}`,
    titleRaw: externalId,
    priceBani,
    shippingBani: ship,
    totalBani: priceBani + ship,
    availability,
    condition: extra.condition ?? 'new',
    sellerType: extra.sellerType ?? 'shop',
    contentHash: createHash('sha256').update(`${priceBani}|${ship}|${availability}|${n}`).digest('hex'),
    observedAt: new Date(Date.now() - (extra.ageHours ?? 1) * 3_600_000),
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE id = ${r.offerId}`);
  return r.offerId!;
}

const consent = { consentAt: new Date(), consentIpHash: 'iphash', consentTextVersion: 'alertConsent.v1' };

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
});
afterAll(async () => t?.drop());

describe('eligible offers', () => {
  it('only fresh, in-stock, new, shop-sold offers without a pending quarantine count', async () => {
    const p = await product();
    await offer(p, 900, { shopId: emag, sellerType: 'marketplace' }); // marketplace: excluded
    await offer(p, 950, { ageHours: 30 }); // older than the 26 h SLO: excluded
    await offer(p, 960, { availability: 'out_of_stock' });
    await offer(p, 970, { condition: 'refurbished' });
    const q = await offer(p, 980);
    await t.db.execute(sql`INSERT INTO price_events_quarantine (offer_id, observed_at, price, reason, observation) VALUES (${q}, now(), 9.80, 'test', '{}')`);
    const ok = await offer(p, 1000, { shippingBani: 1999 });
    const best = await bestAlertOffer(t.db, p);
    expect(best).toMatchObject({ offerId: ok, totalBani: 101_999, priceBani: 100_000, shippingBani: 1999 });
  });

  it('"any variant" looks at every active product of the family', async () => {
    const f = await family();
    const a = await product(f);
    const b = await product(f);
    await offer(a, 500);
    const cheap = await offer(b, 450);
    expect((await bestAlertOffer(t.db, a, false))?.totalBani).toBe(50_000);
    expect((await bestAlertOffer(t.db, a, true))?.offerId).toBe(cheap);
  });
});

describe('double opt-in', () => {
  it('pending → confirmed: consent evidence, baseline, verified address; a second click is harmless', async () => {
    const u = await user();
    const p = await product();
    await offer(p, 2000);
    const { alertId, status } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h1', ...consent });
    expect(status).toBe('pending');
    const c0 = await t.db.execute<{ confirmed_at: Date | null; text_version: string; given_ip_hash: string }>(sql`SELECT confirmed_at, text_version, given_ip_hash FROM consent_records WHERE alert_id = ${alertId}`);
    expect(c0.rows[0]).toMatchObject({ confirmed_at: null, text_version: 'alertConsent.v1', given_ip_hash: 'iphash' });

    expect(await confirmAlert(t.db, alertId, { ipHash: 'ip2', method: 'email_link', ttlDays: 7, emailHash: 'h1' })).toBe('confirmed');
    const a = await t.db.execute<{ status: string; baseline_total: string; confirm_method: string; confirm_ip_hash: string }>(sql`SELECT status, baseline_total::text, confirm_method, confirm_ip_hash FROM alerts WHERE id = ${alertId}`);
    expect(a.rows[0]).toEqual({ status: 'active', baseline_total: '2000.00', confirm_method: 'email_link', confirm_ip_hash: 'ip2' });
    const c1 = await t.db.execute<{ confirmed_at: Date | null; confirm_method: string }>(sql`SELECT confirmed_at, confirm_method FROM consent_records WHERE alert_id = ${alertId}`);
    expect(c1.rows[0]!.confirmed_at).not.toBeNull();
    const v = await t.db.execute<{ email_verified: boolean }>(sql`SELECT email_verified FROM users WHERE id = ${u}`);
    expect(v.rows[0]!.email_verified).toBe(true);
    expect(await confirmAlert(t.db, alertId, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: 'h1' })).toBe('already');
    expect(await confirmAlert(t.db, 999_999, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: null })).toBe('missing');
  });

  it('an expired request cannot be confirmed, and is deleted by retention', async () => {
    const u = await user();
    const p = await product();
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'below', targetBani: 10_000, anyVariant: false, channel: 'email', emailHash: 'h2', ...consent });
    await t.db.execute(sql`UPDATE alerts SET created_at = now() - interval '8 days' WHERE id = ${alertId}`);
    expect(await confirmAlert(t.db, alertId, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: 'h2' })).toBe('expired');
    expect(await deleteExpiredPendingAlerts(t.db, 7)).toBeGreaterThanOrEqual(1);
    expect((await t.db.execute(sql`SELECT 1 FROM alerts WHERE id = ${alertId}`)).rows).toHaveLength(0);
  });

  it('a newer confirmed alert for the same product and channel replaces the older one', async () => {
    const u = await user();
    const p = await product();
    const first = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h3', ...consent, confirm: { method: 'session', ipHash: null } });
    expect(first.status).toBe('active');
    const second = await createAlert(t.db, { userId: u, productId: p, kind: 'below', targetBani: 5_000, anyVariant: false, channel: 'email', emailHash: 'h3', ...consent });
    expect(await confirmAlert(t.db, second.alertId, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: 'h3' })).toBe('confirmed');
    const live = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM alerts WHERE user_id = ${u}`);
    expect(live.rows.map((r) => Number(r.id))).toEqual([second.alertId]);
    const w = await t.db.execute<{ withdraw_method: string }>(sql`SELECT withdraw_method FROM consent_records WHERE alert_id = ${first.alertId}`);
    expect(w.rows[0]!.withdraw_method).toBe('replaced');
  });
});

describe('evaluation claims are idempotent', () => {
  it('two evaluations of the same state queue one notification; a failed delivery gives the state back', async () => {
    const u = await user();
    const p = await product();
    const o = await offer(p, 1500);
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'below', targetBani: 160_000, anyVariant: false, channel: 'email', emailHash: 'h4', ...consent, confirm: { method: 'session', ipHash: null } });
    const [c] = await alertCandidates(t.db, { productIds: [p], channels: ['email'] });
    expect(c).toMatchObject({ alertId, armed: true, best: { offerId: o, totalBani: 150_000 } });

    const s1 = await claimAlertNotification(t.db, c!, 'below_target', 160_000);
    const s2 = await claimAlertNotification(t.db, c!, 'below_target', 160_000); // pg-boss delivered twice
    expect(s1).not.toBeNull();
    expect(s2).toBeNull();
    const after = (await alertCandidates(t.db, { productIds: [p], channels: ['email'] }))[0]!;
    expect(after).toMatchObject({ armed: false, lastNotifiedBani: 150_000 });

    const claimed = await claimQueuedSends(t.db, { channels: ['email'] });
    expect(claimed.map((s) => s.id)).toContain(s1);
    const mine = claimed.find((s) => s.id === s1)!;
    expect(mine).toMatchObject({ stillValid: true, totalBani: 150_000, reason: 'below_target', firstNotification: true });
    expect(await claimQueuedSends(t.db, { channels: ['email'] })).toHaveLength(0); // nothing left to claim

    await finishSends(t.db, [s1!], 'failed', 'smtp down');
    const reverted = (await alertCandidates(t.db, { productIds: [p], channels: ['email'] }))[0]!;
    expect(reverted).toMatchObject({ armed: true, lastNotifiedAt: null, lastNotifiedBani: null });
  });

  it('a send whose offer changed price before delivery is no longer valid', async () => {
    const u = await user();
    const p = await product();
    const o = await offer(p, 1500, { externalId: 'chg' });
    await createAlert(t.db, { userId: u, productId: p, kind: 'below', targetBani: 160_000, anyVariant: false, channel: 'email', emailHash: 'h5', ...consent, confirm: { method: 'session', ipHash: null } });
    const [c] = await alertCandidates(t.db, { productIds: [p], channels: ['email'] });
    const id = await claimAlertNotification(t.db, c!, 'below_target', 160_000);
    await t.db.execute(sql`UPDATE offers SET total_price = 1490, price = 1490 WHERE id = ${o}`);
    const [s] = await sendsByIds(t.db, [id!]);
    expect(s!.stillValid).toBe(false);
  });

  it('only active alerts on the requested channels are evaluated', async () => {
    const u = await user();
    const p = await product();
    await offer(p, 100);
    await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h6', ...consent }); // pending
    expect(await alertCandidates(t.db, { productIds: [p], channels: ['email'] })).toHaveLength(0);
    expect(await alertCandidates(t.db, { productIds: [p], channels: [] })).toHaveLength(0);
  });
});

describe('withdrawal, deletion and export', () => {
  it('unsubscribe all: email alerts gone, consent withdrawn, address suppressed, empty account deleted', async () => {
    const u = await user();
    const p = await product();
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h7', ...consent, confirm: { method: 'session', ipHash: null } });
    const out = await unsubscribeAllEmail(t.db, u, { method: 'list_unsubscribe', emailHash: 'h7', suppress: 'unsubscribed' });
    expect(out).toEqual({ removed: 1, userDeleted: true });
    expect(await suppressionReason(t.db, 'h7')).toBe('unsubscribed');
    const c = await t.db.execute<{ withdraw_method: string; user_id: string | null; email_hash: string }>(sql`SELECT withdraw_method, user_id, email_hash FROM consent_records WHERE alert_id = ${alertId}`);
    expect(c.rows[0]).toEqual({ withdraw_method: 'list_unsubscribe', user_id: null, email_hash: 'h7' }); // evidence outlives the account
  });

  it('a stronger suppression reason is never weakened; a new opt-in lifts a plain unsubscribe', async () => {
    await suppressEmail(t.db, 'h8', 'complaint');
    await suppressEmail(t.db, 'h8', 'unsubscribed');
    expect(await suppressionReason(t.db, 'h8')).toBe('complaint');
    await suppressEmail(t.db, 'h9', 'unsubscribed');
    const u = await user();
    const p = await product();
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h9', ...consent });
    await confirmAlert(t.db, alertId, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: 'h9' });
    expect(await suppressionReason(t.db, 'h9')).toBeNull();
  });

  it('deleting one alert checks ownership; deleting the account removes everything but the evidence', async () => {
    const u = await user();
    const other = await user();
    const p = await product();
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h10', ...consent, confirm: { method: 'session', ipHash: null } });
    expect(await deleteAlert(t.db, alertId, { method: 'account', userId: other })).toBe(false);
    const exported = await exportUserData(t.db, u, 'h10');
    expect(exported).toMatchObject({ user: { id: u }, alerts: [{ id: String(alertId), consent_text_version: 'alertConsent.v1' }] });
    expect((exported!.consentRecords as unknown[]).length).toBe(1);
    expect(await deleteUserData(t.db, u, { method: 'account_deleted', emailHash: 'h10' })).toBe(true);
    expect((await t.db.execute(sql`SELECT 1 FROM users WHERE id = ${u}`)).rows).toHaveLength(0);
    expect((await t.db.execute(sql`SELECT 1 FROM alerts WHERE id = ${alertId}`)).rows).toHaveLength(0);
    expect(await suppressionReason(t.db, 'h10')).toBe('deleted');
    const c = await t.db.execute<{ withdraw_method: string }>(sql`SELECT withdraw_method FROM consent_records WHERE email_hash = 'h10'`);
    expect(c.rows[0]!.withdraw_method).toBe('account_deleted');
  });

  it('editing an alert re-arms it from today\'s price', async () => {
    const u = await user();
    const p = await product();
    await offer(p, 700);
    const { alertId } = await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h11', ...consent, confirm: { method: 'session', ipHash: null } });
    await t.db.execute(sql`UPDATE alerts SET last_notified_at = now(), last_notified_total = 600, armed = false WHERE id = ${alertId}`);
    expect(await updateAlert(t.db, alertId, u, { kind: 'below', targetBani: 65_000 })).toBe(true);
    const a = await t.db.execute<{ kind: string; target_price: string; armed: boolean; last_notified_total: string | null; baseline_total: string }>(
      sql`SELECT kind, target_price::text, armed, last_notified_total::text, baseline_total::text FROM alerts WHERE id = ${alertId}`,
    );
    expect(a.rows[0]).toEqual({ kind: 'below', target_price: '650.00', armed: true, last_notified_total: null, baseline_total: '700.00' });
    expect(await updateAlert(t.db, alertId, 'someone-else', { kind: 'any_drop', targetBani: null })).toBe(false);
  });
});

describe('retention', () => {
  it('unverified accounts without alerts go after 7 days; inactive accounts get a notice, then go', async () => {
    const lonely = await user();
    await t.db.execute(sql`UPDATE users SET created_at = now() - interval '8 days' WHERE id = ${lonely}`);
    const fresh = await user();
    expect(await deleteEmptyAccounts(t.db, { unverifiedDays: 7, inactiveMonths: 24 })).toBeGreaterThanOrEqual(1);
    const left = await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE id IN (${lonely}, ${fresh})`);
    expect(left.rows.map((r) => r.id)).toEqual([fresh]);

    const sleepy = await user();
    const p = await product();
    await createAlert(t.db, { userId: sleepy, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h12', ...consent, confirm: { method: 'session', ipHash: null } });
    await t.db.execute(sql`UPDATE users SET last_active_at = now() - interval '25 months' WHERE id = ${sleepy}`);
    const due = await usersDueRetentionNotice(t.db, 24);
    expect(due.find((x) => x.id === sleepy)).toMatchObject({ alertCount: 1 });
    await t.db.execute(sql`UPDATE users SET retention_notice_at = now() - interval '31 days' WHERE id = ${sleepy}`);
    expect((await usersDueRetentionDeletion(t.db, 30)).map((x) => x.id)).toContain(sleepy);
    await t.db.execute(sql`UPDATE users SET last_active_at = now() WHERE id = ${sleepy}`); // clicked "keep"
    expect((await usersDueRetentionDeletion(t.db, 30)).map((x) => x.id)).not.toContain(sleepy);
  });

  it('consent evidence is kept 3 years after withdrawal; unconfirmed requests 30 days', async () => {
    await t.db.execute(sql`INSERT INTO consent_records (email_hash, purpose, text_version, given_at, confirmed_at, withdrawn_at) VALUES ('old', 'alert_email', 'alertConsent.v1', now() - interval '4 years', now() - interval '4 years', now() - interval '37 months')`);
    await t.db.execute(sql`INSERT INTO consent_records (email_hash, purpose, text_version, given_at, confirmed_at, withdrawn_at) VALUES ('recent', 'alert_email', 'alertConsent.v1', now() - interval '2 years', now() - interval '2 years', now() - interval '1 year')`);
    await t.db.execute(sql`INSERT INTO consent_records (email_hash, purpose, text_version, given_at, alert_id) VALUES ('unconfirmed', 'alert_email', 'alertConsent.v1', now() - interval '31 days', 987654)`);
    await pruneConsentRecords(t.db, { keepYears: 3, unconfirmedDays: 30 });
    const left = await t.db.execute<{ email_hash: string }>(sql`SELECT email_hash FROM consent_records WHERE email_hash IN ('old','recent','unconfirmed')`);
    expect(left.rows.map((r) => r.email_hash)).toEqual(['recent']);
  });

  it('alerts follow merged products; a duplicate for the same user and channel is dropped', async () => {
    const u = await user();
    const from = await product();
    const into = await product();
    await createAlert(t.db, { userId: u, productId: from, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'h13', ...consent, confirm: { method: 'session', ipHash: null } });
    await t.db.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${into} WHERE id = ${from}`);
    expect(await repointMergedAlerts(t.db)).toBe(1);
    const a = await t.db.execute<{ product_id: string }>(sql`SELECT product_id::text FROM alerts WHERE user_id = ${u}`);
    expect(a.rows.map((r) => Number(r.product_id))).toEqual([into]);
  });

  it('clicks and events lose their identifiers after 90 days and disappear after 13 months', async () => {
    await t.db.execute(sql`INSERT INTO clicks (offer_id, shop_id, ts, ip_hash, ua_hash, session_hash) VALUES (1, ${dedeman}, now() - interval '100 days', 'a', 'b', 'c'), (2, ${dedeman}, now() - interval '14 months', 'a', 'b', 'c'), (3, ${dedeman}, now(), 'a', 'b', 'c')`);
    await t.db.execute(sql`INSERT INTO events (name, ts, session_hash) VALUES ('x', now() - interval '100 days', 's'), ('y', now() - interval '14 months', 's')`);
    await minimizeClicksAndEvents(t.db);
    const c = await t.db.execute<{ offer_id: string; ip_hash: string | null }>(sql`SELECT offer_id::text, ip_hash FROM clicks ORDER BY offer_id`);
    expect(c.rows).toEqual([
      { offer_id: '1', ip_hash: null },
      { offer_id: '3', ip_hash: 'a' },
    ]);
    const e = await t.db.execute<{ name: string; session_hash: string | null }>(sql`SELECT name, session_hash FROM events ORDER BY name`);
    expect(e.rows).toEqual([{ name: 'x', session_hash: null }]);
  });
});

describe('M19 review fixes', () => {
  const session = { confirm: { method: 'session' as const, ipHash: null } };
  const liveAlert = async (u: string, p: number, h: string) =>
    (await createAlert(t.db, { userId: u, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: h, ...consent, ...session })).alertId;

  it('several products merged into one: one live alert per user and channel survives, the rest are withdrawn', async () => {
    const [a, b, target, c1, c2, c3] = [await product(), await product(), await product(), await product(), await product(), await product()];
    // Two duplicates (a, b) merged into `target`; u1 watched both, u2 watched a duplicate and the target.
    const u1 = await user();
    const u1a = await liveAlert(u1, a, 'm1');
    const u1b = await liveAlert(u1, b, 'm1');
    const u1pending = (await createAlert(t.db, { userId: u1, productId: b, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'm1', ...consent })).alertId;
    const u2 = await user();
    const u2a = await liveAlert(u2, a, 'm2');
    const u2target = await liveAlert(u2, target, 'm2');
    // A chain c1 → c2 → c3 with alerts on its first and last product.
    const u3 = await user();
    const u3c1 = await liveAlert(u3, c1, 'm3');
    const u3c3 = await liveAlert(u3, c3, 'm3');
    await t.db.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${target} WHERE id IN (${a}, ${b})`);
    await t.db.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${c2} WHERE id = ${c1}`);
    await t.db.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${c3} WHERE id = ${c2}`);

    await repointMergedAlerts(t.db); // used to throw: two of u1's alerts landed on `target`

    const rows = async (u: string) =>
      (await t.db.execute<{ id: string; product_id: string; status: string }>(sql`SELECT id::text, product_id::text, status FROM alerts WHERE user_id = ${u} ORDER BY id`)).rows.map(
        (r) => ({ id: Number(r.id), product: Number(r.product_id), status: r.status }),
      );
    // u1: the newer of the two moved alerts is kept; the pending request follows the merge.
    expect(await rows(u1)).toEqual([
      { id: u1b, product: target, status: 'active' },
      { id: u1pending, product: target, status: 'pending' },
    ]);
    // u2: the alert already on the target wins.
    expect(await rows(u2)).toEqual([{ id: u2target, product: target, status: 'active' }]);
    // u3: the chain ends on c3, where an alert already exists.
    expect(await rows(u3)).toEqual([{ id: u3c3, product: c3, status: 'active' }]);
    const losers = [u1a, u2a, u3c1].sort((x, y) => x - y);
    const withdrawn = await t.db.execute<{ alert_id: string; withdraw_method: string }>(
      sql`SELECT alert_id::text, withdraw_method FROM consent_records WHERE alert_id = ANY(${sql.param(losers)}::bigint[]) ORDER BY alert_id`,
    );
    expect(withdrawn.rows).toEqual(losers.map((id) => ({ alert_id: String(id), withdraw_method: 'replaced' })));
    expect(await repointMergedAlerts(t.db)).toBe(0); // idempotent
  });

  it('two live-alert writers at the same moment never break the unique index (double submit, two confirmations)', async () => {
    const u = await user();
    const p = await product();
    const results = await Promise.all([liveAlert(u, p, 'r1'), liveAlert(u, p, 'r1'), liveAlert(u, p, 'r1')]);
    expect(results).toHaveLength(3);
    const left = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM alerts WHERE user_id = ${u} AND status <> 'pending'`);
    expect(left.rows[0]!.n).toBe('1');

    const v = await user();
    const pending = async () =>
      (await createAlert(t.db, { userId: v, productId: p, kind: 'any_drop', targetBani: null, anyVariant: false, channel: 'email', emailHash: 'r2', ...consent })).alertId;
    const ids = [await pending(), await pending()];
    const outcomes = await Promise.all(ids.map((id) => confirmAlert(t.db, id, { ipHash: null, method: 'email_link', ttlDays: 7, emailHash: 'r2' })));
    expect(outcomes).toEqual(['confirmed', 'confirmed']);
    const live = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM alerts WHERE user_id = ${v} AND status = 'active'`);
    expect(live.rows[0]!.n).toBe('1');
  });

  it('send counters: a fixed window per key, cleared on demand, gone once expired', async () => {
    expect(await hitSendCounter(t.db, 'k1', 60)).toBe(1);
    expect(await hitSendCounter(t.db, 'k1', 60)).toBe(2);
    expect(await hitSendCounter(t.db, 'k2', 60)).toBe(1);
    await clearSendCounter(t.db, 'k1');
    expect(await hitSendCounter(t.db, 'k1', 60)).toBe(1);
    // The window ends: the next send starts a new one.
    await t.db.execute(sql`UPDATE verifications SET expires_at = now() - interval '1 second' WHERE id = 'send-cap:k2'`);
    expect(await hitSendCounter(t.db, 'k2', 60)).toBe(1);
    await t.db.execute(sql`UPDATE verifications SET expires_at = now() - interval '1 second' WHERE id = 'send-cap:k1'`);
    expect(await deleteExpiredVerifications(t.db)).toBeGreaterThanOrEqual(1);
    expect((await t.db.execute(sql`SELECT 1 FROM verifications WHERE id = 'send-cap:k1'`)).rows).toHaveLength(0);
  });

  it('the export says whether (and why) the address is on the suppression list', async () => {
    const u = await user();
    await suppressEmail(t.db, 'x1', 'bounce');
    expect(await exportUserData(t.db, u, 'x1')).toMatchObject({ emailSuppression: { reason: 'bounce' } });
    expect(await exportUserData(t.db, u, 'x-none')).toMatchObject({ emailSuppression: null });
  });

  it('an interrupted delivery goes back to the queue as it was (same rows, same idempotency key); out of attempts it fails', async () => {
    const u = await user();
    const p = await product();
    await offer(p, 1500);
    await createAlert(t.db, { userId: u, productId: p, kind: 'below', targetBani: 160_000, anyVariant: false, channel: 'email', emailHash: 's1', ...consent, ...session });
    const [c] = await alertCandidates(t.db, { productIds: [p], channels: ['email'] });
    const id = (await claimAlertNotification(t.db, c!, 'below_target', 160_000))!;
    await t.db.execute(sql`UPDATE alert_sends SET status = 'sending', attempts = 1, not_before = now() - interval '20 minutes' WHERE id = ${id}`);
    expect(await recoverStuckSends(t.db, 15, 3)).toBe(1);
    const again = await t.db.execute<{ status: string; error: string }>(sql`SELECT status, error FROM alert_sends WHERE id = ${id}`);
    expect(again.rows[0]).toEqual({ status: 'queued', error: 'interrupted' });
    // Still counted as notified: the queued row is delivered again (and deduplicated by the provider).
    expect((await alertCandidates(t.db, { productIds: [p], channels: ['email'] }))[0]).toMatchObject({ armed: false });

    await t.db.execute(sql`UPDATE alert_sends SET status = 'sending', attempts = 3, not_before = now() - interval '20 minutes' WHERE id = ${id}`);
    expect(await recoverStuckSends(t.db, 15, 3)).toBe(1);
    expect((await t.db.execute<{ status: string }>(sql`SELECT status FROM alert_sends WHERE id = ${id}`)).rows[0]!.status).toBe('failed');
    expect((await alertCandidates(t.db, { productIds: [p], channels: ['email'] }))[0]).toMatchObject({ armed: true, lastNotifiedBani: null });
  });
});
