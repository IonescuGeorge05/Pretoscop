import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { KNOWN_FLAGS } from '../queries/flags';
import { decideManually } from '../queries/matching';
import { recordObservation } from '../queries/offers';
import { addDaysIso, bucharestToday, computeProductStats, rollupProducts } from '../queries/rollup';

/**
 * Web Push and Telegram e2e (M27): a throwaway product of its own (never the M13 or M19 fixture, so
 * the specs can run side by side), the three channel flags switched on for the run and put back
 * afterwards, and test accounts `canale-e2e-…@pretoscop.test`. Marked like every e2e fixture
 * (`e2e-fixture-` ids, "(produs de test E2E)" in the title), so `dropE2eFixture` removes it too.
 */
export const E2E_CHANNEL_EMAIL_LIKE = 'canale-e2e-%@pretoscop.test';
export const E2E_CHANNELS_TITLE = 'Căști wireless Testoscop C5, ANC, Bluetooth 5.4, Negru (produs de test E2E)';
const CHANNELS_PREFIX = 'e2e-fixture-channels-';
const CHANNEL_OFFERS = [
  { key: 'a', shop: 'itgalaxy', price: 1499 },
  { key: 'b', shop: 'forit', price: 1549 },
];
export const CHANNEL_FLAGS = ['alerts.email.enabled', 'alerts.push.enabled', 'alerts.telegram.enabled'] as const;

export interface E2eChannelsFixture {
  productId: number;
  slug: string;
  /** The flags as they were before the fixture switched them on (`channels-drop` restores them). */
  flagsWere: Record<string, boolean>;
}

async function observe(db: Db, shopId: number, key: string, lei: number, observedAt: Date): Promise<number> {
  const priceBani = Math.round(lei * 100);
  const r = await recordObservation(db, {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId: `${CHANNELS_PREFIX}${key}`,
    url: `https://example.com/e2e/channels-${key}`,
    titleRaw: E2E_CHANNELS_TITLE,
    titleClean: E2E_CHANNELS_TITLE,
    priceBani,
    shippingBani: 0,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`channels|${key}|${lei}`).digest('hex'),
    observedAt,
  });
  return r.offerId!;
}

export async function setChannelFlags(db: Db, values: Record<string, boolean>): Promise<void> {
  for (const [key, enabled] of Object.entries(values)) {
    if (!(CHANNEL_FLAGS as readonly string[]).includes(key)) continue;
    await db.execute(sql`
      INSERT INTO feature_flags (key, enabled, description) VALUES (${key}, ${enabled}, ${KNOWN_FLAGS[key] ?? key})
      ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`);
  }
}

export async function createChannelsFixture(db: Db): Promise<E2eChannelsFixture> {
  const flags = await db.execute<{ key: string; enabled: boolean }>(sql`SELECT key, enabled FROM feature_flags WHERE key = ANY(${sql.param([...CHANNEL_FLAGS])}::text[])`);
  const flagsWere = Object.fromEntries(CHANNEL_FLAGS.map((k) => [k, flags.rows.find((r) => r.key === k)?.enabled ?? false]));
  await dropChannelsFixture(db, {});
  const shops = await db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops WHERE slug IN ('itgalaxy','forit')`);
  const shopId = new Map(shops.rows.map((r) => [r.slug, Number(r.id)]));
  const ids: Record<string, number> = {};
  for (const o of CHANNEL_OFFERS) {
    const sid = shopId.get(o.shop);
    if (!sid) throw new Error(`e2e channels fixture: shop ${o.shop} missing (run make seed / shops:sync)`);
    ids[o.key] = await observe(db, sid, o.key, o.price, new Date(Date.now() - 3600_000));
  }
  const productId = await decideManually(db, ids.a!, { kind: 'new_product' }, 'e2e-fixture');
  if (!productId) throw new Error('e2e channels fixture: product not created');
  await decideManually(db, ids.b!, { kind: 'accept', productId }, 'e2e-fixture');
  await db.execute(sql`UPDATE products SET provisional = true WHERE id = ${productId}`);
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [productId], from: addDaysIso(today, -1), to: today });
  await computeProductStats(db, [productId], today);
  await setChannelFlags(db, Object.fromEntries(CHANNEL_FLAGS.map((k) => [k, true])));
  const p = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${productId}`);
  return { productId, slug: p.rows[0]!.slug, flagsWere };
}

/** A synthetic price change of a fixture offer (test data only), observed now, re-rolled up. */
export async function channelsFixturePrice(db: Db, key: string, lei: number): Promise<{ offerId: number }> {
  const o = await db.execute<{ shop_id: string; product_id: string }>(sql`SELECT shop_id::text, product_id::text FROM offers WHERE external_id = ${`${CHANNELS_PREFIX}${key}`}`);
  const row = o.rows[0];
  if (!row) throw new Error(`e2e channels fixture: offer ${key} missing`);
  const offerId = await observe(db, Number(row.shop_id), key, lei, new Date());
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [Number(row.product_id)], from: today, to: today });
  await computeProductStats(db, [Number(row.product_id)], today);
  return { offerId };
}

/** Browsers, Telegram link, alerts and consent records of a test address (the e2e assertions). */
export async function channelsFixtureState(db: Db, email: string): Promise<Record<string, unknown>> {
  const u = await db.execute<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = lower(${email})`);
  const userId = u.rows[0]?.id ?? null;
  if (!userId) return { userId: null, devices: [], telegram: null, tokens: 0, alerts: [], consents: [] };
  const devices = await db.execute(sql`SELECT device_label, consent_text_version, endpoint LIKE 'http://127.0.0.1:%' AS local_endpoint FROM push_subscriptions WHERE user_id = ${userId} ORDER BY id`);
  const telegram = await db.execute(sql`SELECT chat_id::text, status, consent_text_version FROM telegram_links WHERE user_id = ${userId}`);
  const tokens = await db.execute<{ n: string; hashed: boolean }>(sql`
    SELECT count(*)::text AS n, coalesce(bool_and(token_hash ~ '^[0-9a-f]{64}$'), true) AS hashed FROM telegram_link_tokens WHERE user_id = ${userId}`);
  const alerts = await db.execute(sql`SELECT channel, status, paused_reason, kind, target_price::text, consent_text_version, confirm_method FROM alerts WHERE user_id = ${userId} ORDER BY id`);
  const consents = await db.execute(sql`
    SELECT purpose, alert_id IS NOT NULL AS per_alert, text_version, confirm_method, withdraw_method FROM consent_records WHERE user_id = ${userId} ORDER BY id`);
  const sends = await db.execute(sql`SELECT channel, status, error FROM alert_sends WHERE user_id = ${userId} ORDER BY id`);
  return {
    sends: sends.rows,
    userId,
    devices: devices.rows,
    telegram: telegram.rows[0] ?? null,
    tokens: Number(tokens.rows[0]?.n ?? 0),
    tokensHashed: tokens.rows[0]?.hashed ?? true,
    alerts: alerts.rows,
    consents: consents.rows,
  };
}

/** Removes the channels fixture and the test accounts (with their channels, by cascade); restores the flags. */
export async function dropChannelsFixture(db: Db, opts: { restoreFlags?: Record<string, boolean> }): Promise<number> {
  await db.execute(sql`DELETE FROM consent_records WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${E2E_CHANNEL_EMAIL_LIKE})`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${E2E_CHANNEL_EMAIL_LIKE}`);
  const like = `${CHANNELS_PREFIX}%`;
  const products = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT product_id::text AS id FROM offers WHERE external_id LIKE ${like} AND product_id IS NOT NULL
    UNION SELECT id::text FROM products WHERE title = ${E2E_CHANNELS_TITLE}`);
  const productIds = products.rows.map((r) => Number(r.id));
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${like})`);
  await db.execute(sql`DELETE FROM offer_aliases WHERE external_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${like}`);
  if (productIds.length) await db.execute(sql`DELETE FROM products WHERE id = ANY(${sql.param(productIds)}::bigint[])`);
  if (opts.restoreFlags) await setChannelFlags(db, opts.restoreFlags);
  return productIds.length;
}
