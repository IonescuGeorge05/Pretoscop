import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { type Db, sql } from '@pretoscop/db';
import {
  createAssistedChannel,
  createOxylabsClient,
  createZyteClient,
  zytePricing,
  type AssistedChannelHandle,
  type AssistedClient,
  type AssistedShopSettings,
} from '@pretoscop/fetch/assisted';
import { PgAssistedLedger } from './assisted-ledger';

/**
 * The assisted channel the worker hands to the fetch layer (M05B), or the reason it has none.
 * Without a channel, `fetchPolite` refuses every assisted host (`assisted_unavailable`): the
 * default, since ASSISTED_VENDOR is `none` until the founders open the vendor account (A10).
 */
export function createAssistedChannelFromEnv(
  env: Env,
  db: Db,
  log: Logger,
): { channel: AssistedChannelHandle | null; reason: string } {
  let client: AssistedClient;
  try {
    if (env.ASSISTED_VENDOR === 'zyte') {
      if (!env.ZYTE_API_KEY) return { channel: null, reason: 'ASSISTED_VENDOR=zyte but ZYTE_API_KEY is empty' };
      client = createZyteClient({ apiKey: env.ZYTE_API_KEY, endpoint: env.ZYTE_API_URL, maxBodyBytes: env.FETCH_MAX_BODY_BYTES });
    } else if (env.ASSISTED_VENDOR === 'oxylabs') {
      if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) return { channel: null, reason: 'ASSISTED_VENDOR=oxylabs but OXYLABS_* are empty' };
      client = createOxylabsClient({ username: env.OXYLABS_USERNAME, password: env.OXYLABS_PASSWORD });
    } else {
      return { channel: null, reason: 'ASSISTED_VENDOR=none' };
    }
  } catch (err) {
    return { channel: null, reason: (err as Error).message };
  }

  // Per-shop price tier and exit country from the registry (shops.crawl_policy), cached 60 s.
  let cache: { at: number; bySlug: Map<string, AssistedShopSettings> } | null = null;
  async function shopSettings(slug: string): Promise<AssistedShopSettings> {
    if (!cache || Date.now() - cache.at > 60_000) {
      const res = await db.execute<{ slug: string; tier: number | null; country: string | null }>(sql`
        SELECT slug, (crawl_policy->>'assisted_tier')::int AS tier, crawl_policy->>'assisted_country' AS country FROM shops`);
      cache = {
        at: Date.now(),
        bySlug: new Map(
          res.rows.map((r) => [r.slug, { pricing: zytePricing(r.tier ?? undefined, env.ASSISTED_EUR_PER_USD), ...(r.country ? { country: r.country } : {}) }]),
        ),
      };
    }
    return cache.bySlug.get(slug) ?? { pricing: zytePricing(undefined, env.ASSISTED_EUR_PER_USD) };
  }

  const channel = createAssistedChannel({
    client,
    ledger: new PgAssistedLedger(db),
    monthlyCapCents: Math.round(env.ASSISTED_MONTHLY_CAP_EUR * 100),
    shopSettings,
    logger: log.child({ component: 'assisted' }),
  });
  return { channel, reason: `${client.vendor}, cap €${env.ASSISTED_MONTHLY_CAP_EUR}` };
}
