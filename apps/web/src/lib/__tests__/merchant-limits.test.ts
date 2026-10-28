import { auditLog, merchants, MERCHANT_DAILY_LIMITS, users } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../auth', () => ({ getSession: vi.fn() }));
vi.mock('../jobs', () => ({ boss: vi.fn() }));
let t: TestDatabase;
vi.mock('../db', () => ({ db: () => t.db }));

const { checkRefusal } = await import('../merchant');

let id: number;
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const actions = async (action: string, n: number) => {
  for (let i = 0; i < n; i++) await t.db.insert(auditLog).values({ actor: 'merchant:u-limite', action, entity: 'merchants', entityId: String(id) });
};

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(users).values({ id: 'u-limite', email: 'ion@limite.ro', role: 'merchant' });
  const [m] = await t.db.insert(merchants).values({ userId: 'u-limite', contactEmail: 'ion@limite.ro', verificationToken: 'tok', domain: 'limite.ro' }).returning({ id: merchants.id });
  id = m!.id;
});
afterAll(async () => {
  await t?.drop();
});

describe('checkRefusal (portal rate limits)', () => {
  it('waits 30 s after the previous feed check whatever the new address, and a minute between uploads', async () => {
    expect(await checkRefusal({ id, validation: { status: 'done', requestedAt: ago(5) }, domainCheck: null, feedUploadedAt: null }, 'feed')).toBe('asteapta');
    expect(await checkRefusal({ id, validation: { status: 'done', requestedAt: ago(31) }, domainCheck: null, feedUploadedAt: null }, 'feed')).toBeNull();
    expect(await checkRefusal({ id, validation: { status: 'done', requestedAt: ago(31) }, domainCheck: null, feedUploadedAt: new Date(Date.now() - 40_000) }, 'upload')).toBe('asteapta');
    expect(await checkRefusal({ id, validation: null, domainCheck: { status: 'done', requestedAt: ago(3) }, feedUploadedAt: null }, 'domain')).toBe('asteapta');
  });

  it('stops each kind at its daily cap', async () => {
    const m = { id, validation: null, domainCheck: null, feedUploadedAt: null };
    await actions('merchant.feed_upload', MERCHANT_DAILY_LIMITS.uploads.limit);
    expect(await checkRefusal(m, 'upload')).toBe('limita');
    expect(await checkRefusal(m, 'feed')).toBeNull();
    await actions('merchant.feed_url', MERCHANT_DAILY_LIMITS.feedChecks.limit - MERCHANT_DAILY_LIMITS.uploads.limit);
    expect(await checkRefusal(m, 'feed')).toBe('limita');
    expect(await checkRefusal(m, 'domain')).toBeNull();
    await actions('merchant.domain_check', MERCHANT_DAILY_LIMITS.domainChecks.limit);
    expect(await checkRefusal(m, 'domain')).toBe('limita');
  });
});
