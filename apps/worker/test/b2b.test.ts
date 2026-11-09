import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '@pretoscop/config/logger';
import {
  acceptB2bInvites,
  addB2bCatalogueSku,
  createB2bWorkspace,
  inviteB2bMember,
  recordObservation,
  seedDev,
  setB2bDigest,
  suppressEmail,
} from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import type { MailMessage, Mailer } from '@pretoscop/mailer';
import { emailHash } from '@pretoscop/notify';
import { digestEmail, runB2bDigest } from '../src/b2b/digest';

const SECRET = 'worker-test-secret-0123456789';
const BASE = 'https://pretoscop.test';
const log = createLogger('test', { level: 'silent' });
const operator = { name: 'Pretoscop (test)', address: 'România', website: BASE };

let t: TestDatabase;
let n = 0;
let ownShop: number;
let rival: number;
const outbox: MailMessage[] = [];
let failMail = false;
const mailer: Mailer = {
  async send(msg) {
    if (failMail) throw new Error('smtp down');
    outbox.push(msg);
    return { id: `msg-${outbox.length}` };
  },
};

async function shop(slug: string, name: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier) VALUES (${slug}, ${name}, ${`${slug}.ro`}, ${`https://${slug}.ro`}, 'retail', 'active', 'direct', 2)
    RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function product(title: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii) VALUES (${`d-${++n}`}, ${title}, ${title}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function observe(productId: number, shopId: number, key: string, lei: number, hoursAgo: number): Promise<void> {
  const priceBani = Math.round(lei * 100);
  const r = await recordObservation(t.db, {
    shopId,
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
    observedAt: new Date(Date.now() - hoursAgo * 3_600_000),
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE id = ${r.offerId}`);
}

async function member(ws: number, email: string, role: 'owner' | 'member' = 'member'): Promise<string> {
  const id = randomBytes(12).toString('hex');
  await t.db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`);
  await inviteB2bMember(t.db, ws, email, role, 'test');
  await acceptB2bInvites(t.db, id, email);
  return id;
}

let wsA: number;
let wsB: number;
let ownerA: string;
let memberA: string;
let tracked: number;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  ownShop = await shop('client-a', 'Client A');
  rival = await shop('rival-x', 'Rival X');
  wsA = await createB2bWorkspace(t.db, { name: 'Client A', kind: 'merchant', shopId: ownShop, plan: 'pilot', createdBy: 'test' });
  wsB = await createB2bWorkspace(t.db, { name: 'Client B', kind: 'brand', plan: 'pilot', createdBy: 'test' });
  ownerA = await member(wsA, 'sefa@client-a.ro', 'owner');
  memberA = await member(wsA, 'coleg@client-a.ro');
  await member(wsB, 'brand@client-b.ro', 'owner');
  await t.db.execute(sql`UPDATE b2b_workspaces SET terms_accepted_at = now()`);
  tracked = await product('Televizor urmărit de A');
  const other = await product('Produs urmărit doar de B');
  await addB2bCatalogueSku(t.db, wsA, tracked, 10);
  await addB2bCatalogueSku(t.db, wsB, other, 10);
  await observe(tracked, rival, 'rx-1', 2000, 30);
  await observe(tracked, rival, 'rx-1', 1899.9, 3);
  await observe(tracked, ownShop, 'own-1', 1950, 2);
  await observe(other, rival, 'rx-2', 100, 40); // B's only change is older than 24 h
});
afterAll(async () => t?.drop());
beforeEach(() => {
  outbox.length = 0;
  failMail = false;
});

describe('B2B daily digest', () => {
  it('sends one email per member who wants it, with only that workspace’s changes, once a day', async () => {
    const now = new Date();
    const r = await runB2bDigest({ db: t.db, mailer, operator, secret: SECRET, log, now });
    expect(r).toEqual({ workspaces: 2, sent: 2, empty: 1, skipped: 0, failed: 0 });
    expect(outbox.map((m) => m.to).sort()).toEqual(['coleg@client-a.ro', 'sefa@client-a.ro']);
    const mail = outbox[0]!;
    expect(mail.subject).toBe('Pretoscop B2B — Client A: 2 schimbări de preț în ultimele 24 de ore');
    expect(mail.text).toContain('Televizor urmărit de A');
    expect(mail.text).toContain('Rival X: 2.000,00 lei → 1.899,90 lei (-5%)');
    expect(mail.text).toContain('Client A — magazinul tău: ofertă nouă, 1.950,00 lei, în stoc');
    expect(mail.text).toContain('peste minimul concurenței');
    expect(mail.text).toContain(`${BASE}/b2b/${wsA}/setari`);
    expect(mail.text).toContain('Pretoscop (test), România');
    expect(mail.text).not.toContain('Produs urmărit doar de B');
    expect(mail.idempotencyKey).toMatch(new RegExp(`^b2b-digest:${wsA}:\\d{4}-\\d{2}-\\d{2}:`));
    expect(mail.html).toContain('Deschide tabelul');
    // Same day again: nothing new is sent.
    expect(await runB2bDigest({ db: t.db, mailer, operator, secret: SECRET, log, now })).toMatchObject({ sent: 0, skipped: 3 });
    expect(outbox).toHaveLength(2);
  });

  it('respects the member’s choice and the suppression list', async () => {
    const tomorrow = new Date(Date.now() + 25 * 3_600_000);
    await observe(tracked, rival, 'rx-1', 1799.9, -2); // a change inside tomorrow's 24 hours
    await setB2bDigest(t.db, wsA, memberA, false);
    await suppressEmail(t.db, emailHash(SECRET, 'sefa@client-a.ro'), 'bounce');
    const r = await runB2bDigest({ db: t.db, mailer, operator, secret: SECRET, log, now: tomorrow });
    // The owner bounced, the colleague opted out; B had nothing to report.
    expect(r).toEqual({ workspaces: 2, sent: 0, empty: 1, skipped: 1, failed: 0 });
    expect(outbox).toHaveLength(0);
    await t.db.execute(sql`DELETE FROM email_suppressions`);
    await setB2bDigest(t.db, wsA, memberA, true);
    void ownerA;
  });

  it('a failed send is retried by the next run', async () => {
    const p = await product('Produs nou pentru reîncercare');
    await addB2bCatalogueSku(t.db, wsA, p, 10);
    const future = new Date(Date.now() + 5 * 86_400_000);
    await observe(p, rival, 'rx-4', 300, -5 * 24 + 1); // observed one hour before `future`
    failMail = true;
    expect(await runB2bDigest({ db: t.db, mailer, operator, secret: SECRET, log, now: future })).toMatchObject({ failed: 2, sent: 0 });
    failMail = false;
    expect(await runB2bDigest({ db: t.db, mailer, operator, secret: SECRET, log, now: future })).toMatchObject({ failed: 0, sent: 2 });
  });

  it('renders HTML-escaped names', () => {
    const e = digestEmail({
      workspaceName: '<script>',
      workspaceUrl: `${BASE}/b2b/1`,
      settingsUrl: `${BASE}/b2b/1/setari`,
      changes: [{ skuId: 1, ref: '<b>', label: 'A & B', shopName: 'S"hop', sellerName: null, own: false, observedAt: '2026-11-09 06:00:00+00', beforeTotalBani: 100, afterTotalBani: 90, beforeAvailability: 'in_stock', afterAvailability: 'in_stock' }],
      total: 1,
      rows: [],
      since: new Date('2026-11-08T06:00:00Z'),
      operator,
    });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;b&gt;');
    expect(e.subject).toContain('o schimbare');
  });
});
