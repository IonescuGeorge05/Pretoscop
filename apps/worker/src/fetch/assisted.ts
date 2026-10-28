import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { type Db, sql } from '@pretoscop/db';
import type { FetcherDeps } from '@pretoscop/fetch';
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

/** A registry domain and its `www.` form: the only hosts the channel reads for that shop. */
export function shopWebHosts(domain: string): string[] {
  const d = domain.trim().toLowerCase().replace(/^www\./, '');
  return [d, `www.${d}`];
}

/**
 * The assisted channel the worker hands to the crawler's fetch layer (M05B), or the reason it has
 * none. Without a channel, `fetchPolite` refuses every assisted host (`assisted_unavailable`): the
 * default, since ASSISTED_VENDOR is `none` until the founders open the vendor account (A10).
 * `dispatcher` is the worker's guarded one (SSRF guard: the vendor endpoint must be a public
 * address unless allowlisted for a local mock).
 */
export function createAssistedChannelFromEnv(
  env: Env,
  db: Db,
  log: Logger,
  dispatcher?: FetcherDeps['dispatcher'],
): { channel: AssistedChannelHandle | null; reason: string } {
  let client: AssistedClient;
  try {
    if (env.ASSISTED_VENDOR === 'zyte') {
      if (!env.ZYTE_API_KEY) return { channel: null, reason: 'ASSISTED_VENDOR=zyte but ZYTE_API_KEY is empty' };
      client = createZyteClient({ apiKey: env.ZYTE_API_KEY, endpoint: env.ZYTE_API_URL, maxBodyBytes: env.FETCH_MAX_BODY_BYTES, ...(dispatcher ? { dispatcher } : {}) });
    } else if (env.ASSISTED_VENDOR === 'oxylabs') {
      if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) return { channel: null, reason: 'ASSISTED_VENDOR=oxylabs but OXYLABS_* are empty' };
      client = createOxylabsClient({ username: env.OXYLABS_USERNAME, password: env.OXYLABS_PASSWORD });
    } else {
      return { channel: null, reason: 'ASSISTED_VENDOR=none' };
    }
  } catch (err) {
    return { channel: null, reason: (err as Error).message };
  }

  // Per-shop price tier, exit country and web hosts from the registry (shops), cached 60 s. A shop
  // missing from the registry gets no settings: the channel then refuses its calls.
  let cache: { at: number; bySlug: Map<string, AssistedShopSettings> } | null = null;
  async function shopSettings(slug: string): Promise<AssistedShopSettings> {
    if (!cache || Date.now() - cache.at > 60_000) {
      const res = await db.execute<{ slug: string; domain: string; tier: number | null; country: string | null }>(sql`
        SELECT slug, domain, (crawl_policy->>'assisted_tier')::int AS tier, crawl_policy->>'assisted_country' AS country FROM shops`);
      cache = {
        at: Date.now(),
        bySlug: new Map(
          res.rows.map((r) => [
            r.slug,
            { pricing: zytePricing(r.tier ?? undefined, env.ASSISTED_EUR_PER_USD), hosts: shopWebHosts(r.domain), ...(r.country ? { country: r.country } : {}) },
          ]),
        ),
      };
    }
    const settings = cache.bySlug.get(slug);
    if (!settings) throw new Error(`shop "${slug}" is not in the registry`);
    return settings;
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
