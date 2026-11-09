import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { asciiFold, parseB2bImport } from '@pretoscop/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptB2bInvites,
  addB2bCatalogueSku,
  applyB2bBillingEvent,
  B2B_BILLING_LAPSED_REASON,
  getB2bWorkspace,
  listB2bInvoices,
  setB2bInvoiceFiscal,
  updateB2bWorkspace,
  b2bChanges,
  b2bDigestRecipients,
  b2bMembership,
  b2bPositions,
  b2bSkuCounts,
  b2bSkuPosition,
  b2bSkuProductId,
  b2bWorkspacesForUser,
  B2bError,
  claimB2bDigest,
  consumeB2bApiQuota,
  createB2bApiKey,
  createB2bWorkspace,
  finishB2bDigest,
  importB2bSkus,
  inviteB2bMember,
  listB2bApiKeys,
  listB2bApiUsage,
  exportUserData,
  pruneB2bLogs,
  recordObservation,
  removeB2bMember,
  removeB2bSku,
  reresolveB2bSkus,
  revokeB2bApiKey,
  searchB2bCatalogue,
  seedDev,
  sql,
  verifyB2bApiKey,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let n = 0;
let ownShop: number;
let rivalA: number;
let rivalB: number;
let market: number;
let brandSamsung: number;

const SENTINEL = 'ICECAT-SENTINEL-B2B-7Q';

async function shop(slug: string, name: string, kind = 'retail', slo?: number): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier, crawl_policy)
    VALUES (${slug}, ${name}, ${`${slug}.ro`}, ${`https://www.${slug}.ro`}, ${kind}, 'active', 'direct', 2, ${JSON.stringify(slo ? { freshness_slo_hours: slo } : {})}::jsonb)
    RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function product(opts: { title?: string; gtin?: string; mpn?: string; brandId?: number } = {}): Promise<number> {
  const slug = `b2b-p-${++n}`;
  const title = opts.title ?? `Produs B2B ${n}`;
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, mpn, mpn_norm, brand_id, attributes)
    VALUES (${slug}, ${title}, ${asciiFold(title)}, ${opts.mpn ?? null}, ${opts.mpn ? opts.mpn.replace(/[^A-Z0-9]/gi, '').toUpperCase() : null}, ${opts.brandId ?? null},
      ${JSON.stringify({ note: SENTINEL })}::jsonb)
    RETURNING id::text`);
  const id = Number(r.rows[0]!.id);
  if (opts.gtin) await t.db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source) VALUES (${opts.gtin}, ${id}, 'feed')`);
  return id;
}

/** An observation of the offer `externalId` (created or updated) at `lei`, `hoursAgo` hours ago. */
async function observe(productId: number, shopId: number, lei: number, extra: Partial<OfferObservation> & { hoursAgo?: number } = {}): Promise<number> {
  const priceBani = Math.round(lei * 100);
  const ship = extra.shippingBani ?? 0;
  const externalId = extra.externalId ?? `o-${++n}`;
  const availability = extra.availability ?? 'in_stock';
  const r = await recordObservation(t.db, {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url: `https://www.shop.ro/${externalId}`,
    titleRaw: externalId,
    priceBani,
    shippingBani: ship,
    totalBani: priceBani + ship,
    availability,
    condition: extra.condition ?? 'new',
    sellerType: extra.sellerType ?? 'shop',
    sellerName: extra.sellerName ?? null,
    isBundle: extra.isBundle ?? false,
    contentHash: createHash('sha256').update(`${priceBani}|${ship}|${availability}|${extra.condition ?? 'new'}`).digest('hex'),
    observedAt: new Date(Date.now() - (extra.hoursAgo ?? 1) * 3_600_000),
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE id = ${r.offerId}`);
  return r.offerId!;
}

async function user(email = `b2b-u${++n}@firma.ro`): Promise<{ id: string; email: string }> {
  const id = randomBytes(12).toString('hex');
  await t.db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`);
  return { id, email };
}

async function workspace(kind: 'merchant' | 'brand' = 'merchant', shopId: number | null = ownShop): Promise<number> {
  return createB2bWorkspace(t.db, { name: `Client ${++n}`, kind, shopId: kind === 'merchant' ? shopId : null, plan: 'pilot', createdBy: 'test' });
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  ownShop = await shop('magazinul-meu', 'Magazinul Meu');
  rivalA = await shop('rival-a', 'Rival A');
  rivalB = await shop('rival-b', 'Rival B', 'retail', 6);
  market = await shop('piata', 'Piața', 'marketplace_host');
  const b = await t.db.execute<{ id: string }>(sql`INSERT INTO brands (name, slug, aliases) VALUES ('Samsung', 'samsung-b2b', '{"Samsung Electronics"}') RETURNING id::text`);
  brandSamsung = Number(b.rows[0]!.id);
});
afterAll(async () => t?.drop());

describe('workspaces, invitations and the tenant gate', () => {
  it('turns invitations into memberships for the address that signs in, owner wins', async () => {
    const ws = await workspace();
    const u = await user('Sefa@Firma.ro'.toLowerCase());
    await inviteB2bMember(t.db, ws, 'SEFA@firma.ro', 'member', 'admin');
    await inviteB2bMember(t.db, ws, 'sefa@firma.ro', 'owner', 'admin'); // replaces the open invitation
    expect(await b2bMembership(t.db, ws, u.id)).toBeNull();
    expect(await acceptB2bInvites(t.db, u.id, u.email)).toBe(1);
    expect(await acceptB2bInvites(t.db, u.id, u.email)).toBe(0);
    expect(await b2bMembership(t.db, ws, u.id)).toMatchObject({ role: 'owner', digest: true });
    expect((await b2bWorkspacesForUser(t.db, u.id)).map((w) => w.id)).toEqual([ws]);
    // Another workspace is invisible to this member.
    const other = await workspace();
    expect(await b2bMembership(t.db, other, u.id)).toBeNull();
  });

  it('keeps the last owner', async () => {
    const ws = await workspace();
    const owner = await user();
    const member = await user();
    await inviteB2bMember(t.db, ws, owner.email, 'owner', 'admin');
    await inviteB2bMember(t.db, ws, member.email, 'member', 'admin');
    await acceptB2bInvites(t.db, owner.id, owner.email);
    await acceptB2bInvites(t.db, member.id, member.email);
    await expect(removeB2bMember(t.db, ws, owner.id)).rejects.toBeInstanceOf(B2bError);
    expect(await removeB2bMember(t.db, ws, member.id)).toBe(true);
    expect(await removeB2bMember(t.db, ws, member.id)).toBe(false);
  });

  it('the account export lists memberships and open invitations; retention drops answered or old invitations', async () => {
    const ws = await workspace();
    const u = await user();
    await inviteB2bMember(t.db, ws, u.email, 'member', 'admin');
    expect((await exportUserData(t.db, u.id, null))?.b2bInvitations).toHaveLength(1);
    await acceptB2bInvites(t.db, u.id, u.email);
    const data = await exportUserData(t.db, u.id, null);
    expect(data?.b2bMemberships).toEqual([expect.objectContaining({ workspace_id: String(ws), role: 'member', digest: true })]);
    await inviteB2bMember(t.db, ws, 'nimeni@firma.ro', 'member', 'admin');
    await t.db.execute(sql`UPDATE b2b_invites SET created_at = now() - interval '91 days' WHERE email = 'nimeni@firma.ro'`);
    const r = await pruneB2bLogs(t.db);
    expect(r.invites).toBeGreaterThanOrEqual(2);
    expect((await t.db.execute(sql`SELECT 1 FROM b2b_invites WHERE workspace_id = ${ws}`)).rows).toHaveLength(0);
  });

  it('a merchant workspace needs its shop', async () => {
    await expect(createB2bWorkspace(t.db, { name: 'x', kind: 'merchant', plan: 'pilot', createdBy: 't' })).rejects.toBeInstanceOf(B2bError);
  });
});

describe('SKU import', () => {
  it('resolves GTINs, brand + MPN and MPN alone; keeps ambiguous and unknown lines; counts duplicates', async () => {
    const byGtin = await product({ gtin: '08806095426280' });
    const byMpn = await product({ mpn: 'SM-S931B-UNIQ', brandId: brandSamsung });
    await product({ mpn: 'TWIN-1' });
    await product({ mpn: 'TWIN-1' });
    const ws = await workspace();
    const parsed = parseB2bImport(
      [
        'sku,ean,mpn,marca,pret',
        'A1,8806095426280,,,',
        'A2,,SM-S931B-UNIQ,Samsung Electronics,"1.999,00"',
        'A3,,TWIN-1,,',
        'A4,4006381333931,,,',
        'A5,8806095426280,,,',
        'A6,bad,,,',
        'A7,,sm s931b uniq,,',
      ].join('\n'),
    );
    const r = await importB2bSkus(t.db, ws, parsed.lines, 100);
    expect(r).toEqual({ added: 4, matched: 2, unmatched: 1, ambiguous: 1, duplicates: 2, invalid: 1, overLimit: 0 });
    const rows = await b2bPositions(t.db, ws);
    const byRef = Object.fromEntries(rows.map((x) => [x.ref, x]));
    expect(byRef.A1!.product?.id).toBe(byGtin);
    expect(byRef.A2!.product?.id).toBe(byMpn);
    expect(byRef.A2!.referencePriceBani).toBe(199_900);
    expect(byRef.A3!.status).toBe('ambiguous');
    expect(byRef.A4!.status).toBe('unmatched');
    // The same list again adds nothing.
    expect((await importB2bSkus(t.db, ws, parsed.lines, 100)).added).toBe(0);
  });

  it('never passes the SKU limit, also with concurrent imports', async () => {
    const ws = await workspace();
    const lists = Array.from({ length: 6 }, (_, k) => parseB2bImport(Array.from({ length: 10 }, (_, i) => `MPNX${k}${i}${n}`).join('\n')).lines);
    const results = await Promise.all(lists.map((l) => importB2bSkus(t.db, ws, l, 25)));
    expect(results.reduce((a, r) => a + r.added, 0)).toBe(25);
    expect(results.reduce((a, r) => a + r.overLimit, 0)).toBe(35);
    expect((await b2bSkuCounts(t.db, ws)).total).toBe(25);
    const p = await product();
    expect(await addB2bCatalogueSku(t.db, ws, p, 25)).toBe('limit');
  });

  it('adds from the catalogue once; refuses hidden products', async () => {
    const ws = await workspace();
    const p = await product({ title: 'Televizor Testoscop QLED 55 B2B' });
    const hidden = await product();
    await t.db.execute(sql`UPDATE products SET status = 'hidden' WHERE id = ${hidden}`);
    expect((await searchB2bCatalogue(t.db, 'testoscop qled')).map((x) => x.id)).toContain(p);
    expect(await addB2bCatalogueSku(t.db, ws, p, 10)).toBe('added');
    expect(await addB2bCatalogueSku(t.db, ws, p, 10)).toBe('duplicate');
    expect(await addB2bCatalogueSku(t.db, ws, hidden, 10)).toBe('not_found');
  });

  it('nightly re-resolution matches new products, follows merges and folds duplicates', async () => {
    const ws = await workspace();
    await importB2bSkus(t.db, ws, parseB2bImport('gtin,sku\n5940000000011,LATER').lines, 10);
    const later = await product({ gtin: '05940000000011' });
    const a = await product();
    const b = await product();
    await addB2bCatalogueSku(t.db, ws, a, 10);
    await addB2bCatalogueSku(t.db, ws, b, 10);
    await t.db.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${b} WHERE id = ${a}`);
    const r = await reresolveB2bSkus(t.db, ws);
    expect(r).toEqual({ followed: 0, folded: 1, newlyMatched: 1 });
    const rows = await b2bPositions(t.db, ws);
    expect(rows.map((x) => x.product?.id).sort()).toEqual([later, b].sort());
    expect(rows.find((x) => x.product?.id === later)?.ref).toBe('LATER');
  });
});

describe('positions', () => {
  it('compares our live offer with fresh, in-stock, new competitor offers only', async () => {
    const p = await product({ gtin: '04006381333931' });
    const ws = await workspace();
    await addB2bCatalogueSku(t.db, ws, p, 10);
    await observe(p, ownShop, 1000);
    await observe(p, rivalA, 950, { shippingBani: 2000 }); // 970
    await observe(p, rivalB, 900, { hoursAgo: 8 }); // older than Rival B's 6 h SLO: not comparable
    await observe(p, market, 980, { sellerType: 'marketplace', sellerName: 'Vânzător X' });
    await observe(p, rivalA, 800, { availability: 'out_of_stock' });
    await observe(p, rivalA, 700, { condition: 'refurbished' });
    await observe(p, rivalA, 600, { isBundle: true });
    const q = await observe(p, rivalA, 500);
    await t.db.execute(sql`INSERT INTO price_events_quarantine (offer_id, observed_at, price, reason, observation) VALUES (${q}, now(), 5.00, 'test', '{}')`);
    const [row] = await b2bPositions(t.db, ws);
    expect(row!.own).toMatchObject({ shopName: 'Magazinul Meu', totalBani: 100_000, own: true });
    expect(row!.ownBasis).toBe('offer');
    expect(row!.position).toEqual({ minBani: 97_000, medianBani: 97_500, competitors: 2, rank: 3, gapToMinPct: 3.1, status: 'above' });
    expect(row!.cheapest).toEqual({ shopName: 'Rival A', sellerName: null, totalBani: 97_000 });
    expect(row!.offers).toHaveLength(7);
    expect(row!.offers.filter((o) => o.comparable).map((o) => o.totalBani)).toEqual([97_000, 98_000]);
    expect(row!.offers.find((o) => o.shopName === 'Piața')?.sellerName).toBe('Vânzător X');
    expect(row!.offers.find((o) => o.shopName === 'Rival B')?.stale).toBe(true);
  });

  it('uses the reference price in brand workspaces', async () => {
    const p = await product();
    const ws = await workspace('brand');
    await importB2bSkus(t.db, ws, parseB2bImport(`mpn,pret\nREFPRICE${n},"1.000,00"`).lines, 10);
    await t.db.execute(sql`UPDATE b2b_skus SET product_id = ${p}, status = 'matched', identity = ${`product:${p}`} WHERE workspace_id = ${ws}`);
    await observe(p, rivalA, 1100);
    const [row] = await b2bPositions(t.db, ws);
    expect(row!.ownBasis).toBe('reference');
    expect(row!.position).toMatchObject({ rank: 1, status: 'cheapest', minBani: 110_000 });
  });

  it("never returns another workspace's SKU", async () => {
    const p = await product();
    const a = await workspace();
    const b = await workspace();
    await addB2bCatalogueSku(t.db, a, p, 10);
    const [row] = await b2bPositions(t.db, a);
    expect(await b2bSkuPosition(t.db, b, row!.skuId)).toBeNull();
    expect(await b2bSkuProductId(t.db, b, row!.skuId)).toBeNull();
    expect(await removeB2bSku(t.db, b, row!.skuId)).toBe(false);
    expect(await b2bPositions(t.db, b)).toEqual([]);
    expect(await b2bSkuPosition(t.db, a, row!.skuId)).not.toBeNull();
  });

  it('never carries Icecat content or catalogue attributes (query level and output)', async () => {
    const p = await product({ title: 'Laptop cu specificații Icecat' });
    await t.db.execute(sql`INSERT INTO product_specs (product_id, source, locale, data, attribution) VALUES (${p}, 'icecat', 'ro', ${JSON.stringify({ Greutate: SENTINEL })}::jsonb, 'Icecat')`);
    const img = await t.db.execute<{ id: string }>(sql`
      INSERT INTO product_images (product_id, storage_key, source, source_url, license_note, width, height, sha256, is_primary)
      VALUES (${p}, ${`icecat/${SENTINEL}.webp`}, 'icecat', ${`https://images.icecat.biz/${SENTINEL}.jpg`}, 'Icecat', 10, 10, 'x', true) RETURNING id::text`);
    await t.db.execute(sql`UPDATE products SET primary_image_id = ${Number(img.rows[0]!.id)} WHERE id = ${p}`);
    const ws = await workspace();
    await addB2bCatalogueSku(t.db, ws, p, 10);
    await observe(p, rivalA, 2500);
    const rows = await b2bPositions(t.db, ws);
    const changes = await b2bChanges(t.db, ws, new Date(Date.now() - 86_400_000), new Date());
    const out = JSON.stringify({ rows, changes, search: await searchB2bCatalogue(t.db, 'laptop specificatii icecat') });
    expect(out).toContain('Laptop cu specificații Icecat');
    expect(out).not.toContain(SENTINEL);
    expect(out).not.toMatch(/icecat\.biz|storage_key|primaryImage|attributes/i);
    // The module reads the catalogue only through the b2b_products view.
    const src = readFileSync(new URL('../src/queries/b2b.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/product_specs|product_images|primary_image|\battributes\b|JOIN products\b|FROM products\b/);
    expect(src).not.toMatch(/\b(clicks|alerts|alert_sends|events|consent_records|sessions|push_subscriptions|telegram_links)\b/);
  });
});

describe('daily changes', () => {
  it('lists observed changes with the state before, for this workspace only', async () => {
    const p = await product({ title: 'Boxă urmărită' });
    const ws = await workspace();
    const other = await workspace();
    await addB2bCatalogueSku(t.db, ws, p, 10);
    const ext = `chg-${++n}`;
    await observe(p, rivalA, 300, { externalId: ext, hoursAgo: 30 });
    await observe(p, rivalA, 280, { externalId: ext, hoursAgo: 2 });
    await observe(p, ownShop, 290, { hoursAgo: 3 });
    const { changes, total } = await b2bChanges(t.db, ws, new Date(Date.now() - 24 * 3_600_000), new Date());
    expect(total).toBe(2);
    expect(changes[0]).toMatchObject({ label: 'Boxă urmărită', shopName: 'Rival A', own: false, beforeTotalBani: 30_000, afterTotalBani: 28_000 });
    expect(changes[1]).toMatchObject({ shopName: 'Magazinul Meu', own: true, beforeTotalBani: null, afterTotalBani: 29_000 });
    expect((await b2bChanges(t.db, other, new Date(Date.now() - 24 * 3_600_000), new Date())).total).toBe(0);
  });

  it('claims each digest once per workspace, day and member; a failed one may be retried', async () => {
    const ws = await workspace();
    const u = await user();
    await inviteB2bMember(t.db, ws, u.email, 'owner', 'admin');
    await acceptB2bInvites(t.db, u.id, u.email);
    expect((await b2bDigestRecipients(t.db)).some((r) => r.workspaceId === ws)).toBe(false); // terms not accepted
    await t.db.execute(sql`UPDATE b2b_workspaces SET terms_accepted_at = now() WHERE id = ${ws}`);
    expect((await b2bDigestRecipients(t.db)).filter((r) => r.workspaceId === ws).map((r) => r.userId)).toEqual([u.id]);
    expect(await claimB2bDigest(t.db, ws, '2026-11-09', u.id)).toBe(true);
    expect(await claimB2bDigest(t.db, ws, '2026-11-09', u.id)).toBe(false);
    await finishB2bDigest(t.db, ws, '2026-11-09', u.id, { ok: false, error: 'smtp' });
    expect(await claimB2bDigest(t.db, ws, '2026-11-09', u.id)).toBe(true);
    await finishB2bDigest(t.db, ws, '2026-11-09', u.id, { ok: true, changes: 3 });
    expect(await claimB2bDigest(t.db, ws, '2026-11-09', u.id)).toBe(false);
  });
});

describe('API keys and quotas', () => {
  it('stores only a hash, verifies in constant time, refuses wrong, revoked and foreign keys', async () => {
    const ws = await workspace();
    const other = await workspace();
    const { id, key } = await createB2bApiKey(t.db, ws, 'ERP', 'test');
    const secret = key.slice(-43);
    const stored = await t.db.execute<{ secret_hash: string }>(sql`SELECT secret_hash FROM b2b_api_keys WHERE id = ${id}`);
    expect(stored.rows[0]!.secret_hash).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(JSON.stringify(stored.rows)).not.toContain(secret);
    expect(await verifyB2bApiKey(t.db, key)).toMatchObject({ keyId: id, workspaceId: ws, plan: 'pilot', status: 'active' });
    const flipped = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
    expect(await verifyB2bApiKey(t.db, flipped)).toBeNull();
    expect(await verifyB2bApiKey(t.db, `psk_${'a'.repeat(12)}_${secret}`)).toBeNull();
    expect(await verifyB2bApiKey(t.db, 'nonsense')).toBeNull();
    expect(await revokeB2bApiKey(t.db, other, id, 'x')).toBe(false); // another workspace cannot revoke it
    expect(await revokeB2bApiKey(t.db, ws, id, 'x')).toBe(true);
    expect(await verifyB2bApiKey(t.db, key)).toBeNull();
    expect((await listB2bApiKeys(t.db, ws))[0]).toMatchObject({ id, revokedAt: expect.any(String) });
    expect(JSON.stringify(await listB2bApiKeys(t.db, ws))).not.toContain(secret);
    expect(await listB2bApiKeys(t.db, other)).toEqual([]);
  });

  it('never lets concurrent requests pass the daily quota', async () => {
    const ws = await workspace();
    const day = '2026-11-09';
    const results = await Promise.all(Array.from({ length: 60 }, () => consumeB2bApiQuota(t.db, ws, 25, day)));
    expect(results.filter((r) => r.allowed)).toHaveLength(25);
    expect(new Set(results.filter((r) => r.allowed).map((r) => r.used)).size).toBe(25);
    expect(await listB2bApiUsage(t.db, ws, 100_000)).toEqual([{ day, requests: 25, refused: 35 }]);
    expect((await consumeB2bApiQuota(t.db, ws, 0, day)).allowed).toBe(false);
    // A higher limit (plan change) lets requests through again on the same day; another day starts at zero.
    expect((await consumeB2bApiQuota(t.db, ws, 26, day)).allowed).toBe(true);
    expect(await consumeB2bApiQuota(t.db, ws, 25, '2026-11-10')).toMatchObject({ allowed: true, used: 1 });
  });
});

describe('billing events', () => {
  it('links the subscription, follows its state, records invoices with the buyer data, once per event', async () => {
    const ws = await workspace();
    await updateB2bWorkspace(t.db, ws, { companyName: 'SC Client SRL', cui: '14399840', billingAddress: 'Str. Exemplu 1, București', billingEmail: 'facturi@client.ro' });
    // The invoice may arrive before the checkout event: the subscription metadata names the workspace.
    const inv = {
      kind: 'invoice_paid' as const,
      invoiceId: `in_${n}`,
      subscriptionId: `sub_${n}`,
      customerId: 'cus_1',
      workspaceId: ws,
      plan: 'pro' as const,
      currency: 'EUR',
      subtotal: 14_900,
      tax: 3_129,
      total: 18_029,
      periodStart: new Date('2026-11-09T10:00:00Z'),
      periodEnd: new Date('2026-12-09T10:00:00Z'),
      paidAt: new Date('2026-11-09T10:00:05Z'),
    };
    expect(await applyB2bBillingEvent(t.db, 'stripe', `evt_inv_${n}`, 'invoice.paid', inv)).toBe('applied');
    expect(await applyB2bBillingEvent(t.db, 'stripe', `evt_inv_${n}`, 'invoice.paid', inv)).toBe('duplicate');
    expect(
      await applyB2bBillingEvent(t.db, 'stripe', `evt_co_${n}`, 'checkout.session.completed', {
        kind: 'checkout_completed',
        workspaceId: ws,
        customerId: 'cus_1',
        subscriptionId: `sub_${n}`,
        plan: 'pro',
        paid: true,
      }),
    ).toBe('applied');
    let w = (await getB2bWorkspace(t.db, ws))!;
    expect(w).toMatchObject({ plan: 'pro', billingStatus: 'active', billingProvider: 'stripe', billingCustomerId: 'cus_1', billingSubscriptionId: `sub_${n}` });
    const [invoice] = await listB2bInvoices(t.db, ws);
    expect(invoice).toMatchObject({ currency: 'EUR', netAmount: '149.00', vatRate: '21.00', vatAmount: '31.29', totalAmount: '180.29', buyerCui: '14399840', buyerName: 'SC Client SRL', efacturaStatus: 'to_issue', periodStart: '2026-11-09' });
    expect(await listB2bInvoices(t.db, ws, '2026-11')).toHaveLength(1);
    expect(await listB2bInvoices(t.db, ws, '2026-10')).toHaveLength(0);
    expect(await setB2bInvoiceFiscal(t.db, invoice!.id, 'PSC-0001', 'issued')).toBe(true);
    // Renewal fails, then the subscription ends: the workspace is suspended with the billing reason.
    const sub = (status: string, id = `sub_${n}`) => ({ kind: 'subscription' as const, subscriptionId: id, customerId: 'cus_1', workspaceId: ws, status, periodEnd: new Date('2026-12-09T10:00:00Z'), plan: null });
    await applyB2bBillingEvent(t.db, 'stripe', `evt_s1_${n}`, 'customer.subscription.updated', sub('past_due'));
    expect((await getB2bWorkspace(t.db, ws))!).toMatchObject({ billingStatus: 'past_due', status: 'active' });
    // Another (old) subscription of the customer ending changes nothing.
    await applyB2bBillingEvent(t.db, 'stripe', `evt_old_${n}`, 'customer.subscription.deleted', sub('canceled', 'sub_old'));
    expect((await getB2bWorkspace(t.db, ws))!.status).toBe('active');
    await applyB2bBillingEvent(t.db, 'stripe', `evt_s2_${n}`, 'customer.subscription.deleted', sub('canceled'));
    w = (await getB2bWorkspace(t.db, ws))!;
    expect(w).toMatchObject({ billingStatus: 'canceled', status: 'suspended', statusReason: B2B_BILLING_LAPSED_REASON });
    // Subscribing again lifts the billing suspension (and only that one).
    await applyB2bBillingEvent(t.db, 'stripe', `evt_co2_${n}`, 'checkout.session.completed', { kind: 'checkout_completed', workspaceId: ws, customerId: 'cus_1', subscriptionId: `sub_new_${n}`, plan: 'starter', paid: true });
    expect((await getB2bWorkspace(t.db, ws))!).toMatchObject({ status: 'active', statusReason: null, plan: 'starter', billingSubscriptionId: `sub_new_${n}` });
  });

  it('an event for no known workspace is not recorded, so the retry can apply it', async () => {
    const orphan = { kind: 'subscription' as const, subscriptionId: 'sub_nobody', customerId: null, workspaceId: null, status: 'active', periodEnd: null, plan: null };
    expect(await applyB2bBillingEvent(t.db, 'stripe', 'evt_orphan', 'customer.subscription.updated', orphan)).toBe('unknown_workspace');
    expect((await t.db.execute(sql`SELECT 1 FROM b2b_billing_events WHERE event_id = 'evt_orphan'`)).rows).toHaveLength(0);
  });
});
