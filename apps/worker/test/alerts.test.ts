import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '@pretoscop/config/logger';
import { createAlert, recordObservation, seedDev, setFlag, suppressEmail, type AlertKind } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import type { MailMessage, Mailer } from '@pretoscop/mailer';
import { alertLinks, emailHash, verifyLink } from '@pretoscop/notify';
import { deliverAlerts, MAX_ATTEMPTS, type DeliverDeps } from '../src/alerts/deliver';
import { enabledChannels, evaluateAlerts } from '../src/alerts/evaluate';
import { createEmailSender, createNotifier } from '../src/alerts/notifier';
import { runAlertRetention } from '../src/alerts/retention';

const SECRET = 'worker-test-secret-0123456789';
const BASE = 'https://pretoscop.test';
const log = createLogger('test', { level: 'silent' });
const operator = { name: 'Pretoscop (test)', address: 'România', website: BASE };
const links = alertLinks(SECRET, BASE);
// Daytime in Romania: quiet hours never interfere with these tests.
const NOON = new Date('2026-11-06T10:00:00Z');

let t: TestDatabase;
let dedeman: number;
let n = 0;
const outbox: MailMessage[] = [];
let failMail = false;
const mailer: Mailer = {
  async send(msg) {
    if (failMail) throw new Error('smtp down');
    outbox.push(msg);
    return { id: `msg-${outbox.length}` };
  },
};
const deps = (): DeliverDeps => ({ db: t.db, notifier: createNotifier({ email: createEmailSender(t.db, mailer) }), links, operator, secret: SECRET, log });

async function product(): Promise<number> {
  const slug = `produs-${++n}`;
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii) VALUES (${`${slug}-x`}, ${`Produs de test ${n}`}, ${slug}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

/** Records an observation (price change → event) for the offer `key` of a product, checked now. */
async function observe(productId: number, key: string, lei: number): Promise<number> {
  const priceBani = Math.round(lei * 100);
  const r = await recordObservation(t.db, {
    shopId: dedeman,
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
    observedAt: new Date(),
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE id = ${r.offerId}`);
  return r.offerId!;
}

async function userWith(email = `alert-${++n}-${randomBytes(3).toString('hex')}@pretoscop.test`): Promise<{ id: string; email: string }> {
  const id = randomBytes(12).toString('hex');
  await t.db.execute(sql`INSERT INTO users (id, email, email_verified) VALUES (${id}, ${email}, true)`);
  return { id, email };
}

async function activeAlert(userId: string, productId: number, kind: AlertKind, targetBani: number | null = null, emailHashValue: string | null = null): Promise<number> {
  const r = await createAlert(t.db, {
    userId,
    productId,
    kind,
    targetBani,
    anyVariant: false,
    channel: 'email',
    consentAt: new Date(),
    consentIpHash: 'ip',
    consentTextVersion: 'alertConsent.v1',
    emailHash: emailHashValue,
    confirm: { method: 'session', ipHash: null },
  });
  return r.alertId;
}

/** Evaluates the alerts watching `productIds` (tests share one database), then delivers. */
const run = async (...productIds: number[]) => {
  const evaluated = await evaluateAlerts(t.db, { productIds, channels: ['email'], now: NOON });
  const delivered = await deliverAlerts(deps(), { channels: ['email'], now: NOON });
  return { evaluated, delivered };
};

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'dedeman'`);
  dedeman = Number(r.rows[0]!.id);
});
afterAll(async () => t?.drop());
beforeEach(() => {
  outbox.length = 0;
  failMail = false;
});

describe('alerts.evaluate → alerts.deliver', () => {
  it('fires once below the target, with honest content and one-click unsubscribe headers', async () => {
    const p = await product();
    const offerId = await observe(p, `a-${p}`, 2100);
    const u = await userWith();
    const alertId = await activeAlert(u.id, p, 'below', 200_000);
    expect((await run(p)).delivered.sent).toBe(0); // 2.100 lei: above the target

    await observe(p, `a-${p}`, 1949.5); // synthetic drop
    const r = await run(p);
    expect(r.evaluated.queued).toBe(1);
    expect(r.delivered).toMatchObject({ messages: 1, sent: 1 });
    expect(outbox).toHaveLength(1);
    const m = outbox[0]!;
    expect(m.to).toBe(u.email);
    expect(m.subject).toMatch(/^Preț mai mic: Produs de test \d+ – 1\.949,50 lei$/);
    expect(m.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/pretoscop\.test\/api\/alerts\/unsubscribe\?u=/);
    expect(m.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.text).toContain('Preț total acum: 1.949,50 lei la Dedeman');
    expect(m.text).toContain('Sub pragul tău de 2.000,00 lei.');
    expect(m.text).toContain(`Vezi oferta: ${BASE}/out/${offerId}?p=alert`);
    expect(m.text).toMatch(/Verificat de Pretoscop pe \d+ \w+\. \d{4}, \d{2}:\d{2} \(ora României\)/);
    const unsub = /Oprește această alertă: (\S+)/.exec(m.text)![1]!;
    expect(verifyLink(SECRET, 'unsub-alert', alertId, new URL(unsub).searchParams.get('t'))).toBe(true);

    // Dedupe: re-running (pg-boss delivers twice, the nightly pass, …) sends nothing new.
    const again = await run(p);
    expect(again.evaluated.queued).toBe(0);
    expect(again.delivered.sent).toBe(0);
    expect(outbox).toHaveLength(1);
    const sends = await t.db.execute<{ status: string; provider_message_id: string }>(sql`SELECT status, provider_message_id FROM alert_sends WHERE alert_id = ${alertId}`);
    expect(sends.rows).toEqual([{ status: 'sent', provider_message_id: 'msg-1' }]);
  });

  it('pending (unconfirmed) alerts never send anything', async () => {
    const p = await product();
    await observe(p, `b-${p}`, 500);
    const u = await userWith();
    await createAlert(t.db, { userId: u.id, productId: p, kind: 'below', targetBani: 60_000, anyVariant: false, channel: 'email', consentAt: new Date(), consentIpHash: null, consentTextVersion: 'alertConsent.v1', emailHash: null });
    await observe(p, `b-${p}`, 450);
    const r = await run(p);
    expect(r.evaluated.candidates).toBe(0);
    expect(outbox.filter((m) => m.to === u.email)).toHaveLength(0);
  });

  it('several alerts of one user that fire together arrive in one email', async () => {
    const u = await userWith();
    const p1 = await product();
    const p2 = await product();
    await observe(p1, `c1-${p1}`, 1000);
    await observe(p2, `c2-${p2}`, 3000);
    await activeAlert(u.id, p1, 'any_drop');
    await activeAlert(u.id, p2, 'any_drop');
    await observe(p1, `c1-${p1}`, 900);
    await observe(p2, `c2-${p2}`, 2850);
    const r = await run(p1, p2);
    expect(r.evaluated.queued).toBe(2);
    const mine = outbox.filter((m) => m.to === u.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe('2 alerte de preț: prețuri mai mici la produsele urmărite');
    expect(mine[0]!.text).toContain('Cu 10% sub 1.000,00 lei, prețul de la pornirea alertei.');
    expect(mine[0]!.text).toContain('Cu 5% sub 3.000,00 lei, prețul de la pornirea alertei.');
  });

  it('a failing mailer retries, then gives up and gives the alert its state back', async () => {
    const p = await product();
    await observe(p, `d-${p}`, 800);
    const u = await userWith();
    const alertId = await activeAlert(u.id, p, 'any_drop');
    await observe(p, `d-${p}`, 700);
    failMail = true;
    expect((await run(p)).delivered).toMatchObject({ retried: 1, sent: 0 });
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await t.db.execute(sql`UPDATE alert_sends SET not_before = now() WHERE alert_id = ${alertId}`);
      await deliverAlerts(deps(), { channels: ['email'], now: NOON });
    }
    const s = await t.db.execute<{ status: string; attempts: number }>(sql`SELECT status, attempts FROM alert_sends WHERE alert_id = ${alertId}`);
    expect(s.rows[0]).toEqual({ status: 'failed', attempts: MAX_ATTEMPTS });
    const a = await t.db.execute<{ last_notified_total: string | null }>(sql`SELECT last_notified_total::text FROM alerts WHERE id = ${alertId}`);
    expect(a.rows[0]!.last_notified_total).toBeNull(); // not "notified": the next evaluation tries again
    failMail = false;
    expect((await run(p)).delivered.sent).toBe(1);
  });

  it('a suppressed address is never emailed', async () => {
    const p = await product();
    await observe(p, `e-${p}`, 100);
    const u = await userWith();
    await activeAlert(u.id, p, 'any_drop');
    await suppressEmail(t.db, emailHash(SECRET, u.email), 'complaint');
    await observe(p, `e-${p}`, 80);
    const r = await run(p);
    expect(r.delivered).toMatchObject({ skipped: 1, sent: 0 });
    expect(outbox.filter((m) => m.to === u.email)).toHaveLength(0);
    const a = await t.db.execute<{ status: string; paused_reason: string }>(sql`SELECT status, paused_reason FROM alerts WHERE user_id = ${u.id}`);
    expect(a.rows[0]).toEqual({ status: 'paused', paused_reason: 'suppressed' }); // not re-queued on every pass
  });

  it('a price that changes between evaluation and delivery is not sent; the next pass uses the new price', async () => {
    const p = await product();
    await observe(p, `f-${p}`, 1000);
    const u = await userWith();
    await activeAlert(u.id, p, 'any_drop');
    await observe(p, `f-${p}`, 900);
    expect((await evaluateAlerts(t.db, { productIds: [p], channels: ['email'], now: NOON })).queued).toBe(1);
    await observe(p, `f-${p}`, 880); // changed again before delivery
    expect((await deliverAlerts(deps(), { channels: ['email'], now: NOON })).skipped).toBe(1);
    const r = await run(p);
    expect(r.delivered.sent).toBe(1);
    expect(outbox.find((m) => m.to === u.email)?.text).toContain('Preț total acum: 880,00 lei');
  });

  it('a further drop after a notification waits out the 24 hours, then is sent (cooldown path)', async () => {
    const p = await product();
    await observe(p, `g-${p}`, 1000);
    const u = await userWith();
    await activeAlert(u.id, p, 'any_drop');
    await observe(p, `g-${p}`, 900);
    expect((await run(p)).delivered.sent).toBe(1);
    await observe(p, `g-${p}`, 800); // within 24 h of the first email
    const quiet = await evaluateAlerts(t.db, { productIds: [p], channels: ['email'], now: new Date() });
    expect(quiet).toMatchObject({ queued: 0, quiet: { cooldown: 1 } });
    await t.db.execute(sql`UPDATE alerts SET last_notified_at = now() - interval '25 hours' WHERE user_id = ${u.id}`);
    const r = await run(p);
    expect(r.evaluated.queued).toBe(1);
    expect(outbox.filter((m) => m.to === u.email).at(-1)?.text).toContain('Cu 11% sub 900,00 lei, prețul din alerta anterioară.');
  });

  it('only channels whose flag is on are evaluated', async () => {
    expect(await enabledChannels(t.db)).toEqual([]);
    await setFlag(t.db, 'alerts.email.enabled', true);
    expect(await enabledChannels(t.db)).toEqual(['email']);
    await setFlag(t.db, 'alerts.email.enabled', false);
  });
});

describe('retention', () => {
  it('24 months inactive: a notice with a keep link, deletion 30 days later', async () => {
    const p = await product();
    const u = await userWith();
    await activeAlert(u.id, p, 'any_drop');
    await t.db.execute(sql`UPDATE users SET last_active_at = now() - interval '25 months' WHERE id = ${u.id}`);
    const r1 = await runAlertRetention({ db: t.db, mailer, links, operator, secret: SECRET, log }, NOON);
    expect(r1.notices).toBeGreaterThanOrEqual(1);
    const notice = outbox.find((m) => m.to === u.email)!;
    expect(notice.subject).toMatch(/^Contul tău Pretoscop va fi șters pe 6 decembrie 2026$/);
    expect(notice.text).toContain(`${BASE}/alerte/pastreaza?u=${u.id}&t=`);
    await t.db.execute(sql`UPDATE users SET retention_notice_at = now() - interval '31 days' WHERE id = ${u.id}`);
    const r2 = await runAlertRetention({ db: t.db, mailer, links, operator, secret: SECRET, log }, NOON);
    expect(r2.accountsDeleted).toBeGreaterThanOrEqual(1);
    expect((await t.db.execute(sql`SELECT 1 FROM users WHERE id = ${u.id}`)).rows).toHaveLength(0);
    const c = await t.db.execute<{ withdraw_method: string }>(sql`SELECT withdraw_method FROM consent_records WHERE email_hash IS NULL AND user_id IS NULL AND withdraw_method = 'retention'`);
    expect(c.rows.length).toBeGreaterThanOrEqual(1);
  });
});
