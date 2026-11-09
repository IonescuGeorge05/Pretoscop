import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { featureFlags } from '../schema/system';

/** Flags known to the code. Anything touching a shop, money or email defaults to off. */
export const KNOWN_FLAGS: Record<string, string> = {
  'crawl.enabled': 'Master switch for every request to a shop (in addition to env CRAWL_ENABLED)',
  'source.emag.enabled': 'eMAG source (ADR-013): founder decision required',
  'assisted.enabled': 'Assisted-access channel for designated shops (ADR-015)',
  'llm.matching.enabled': 'LLM gray-zone verification in matching (M22)',
  'alerts.email.enabled': 'Price alert emails (M19)',
  'alerts.push.enabled': 'Price alerts as browser notifications (M27; needs VAPID keys)',
  'alerts.telegram.enabled': 'Price alerts on Telegram and the bot commands (M27; needs TELEGRAM_BOT_TOKEN)',
  'telegram.deals.enabled': 'Daily verified-deals post in the Telegram channel (M27; needs TELEGRAM_DEALS_CHAT_ID)',
  'affiliate.links.enabled': 'Use affiliate links in click-outs when the program allows (M24)',
  'promoted.enabled': 'Promoted placements (M25)',
  'icecat.enabled': 'Open Icecat enrichment: specs and licensed images (M11); needs an Open Icecat account (B1)',
  'merchants.portal.enabled': 'Merchant self-serve portal: new registrations and submissions (M20)',
  'extractors.canary.enabled': 'Weekly extractor canary: up to 5 live URLs per active shop, field drift alerts (M21)',
  'shops.probe.enabled': 'shops:probe re-probes (M21): at most 3 polite requests per run; on only for a founder probe session',
};

export async function isFlagEnabled(db: Db, key: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, key));
  return row?.enabled ?? false;
}

export async function setFlag(
  db: Db,
  key: string,
  enabled: boolean,
  config?: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key, enabled, config: config ?? {}, description: KNOWN_FLAGS[key] ?? null })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, ...(config ? { config } : {}), updatedAt: sql`now()` },
    });
}

/** Inserts missing known flags (off) without touching existing values. */
export async function ensureKnownFlags(db: Db): Promise<void> {
  for (const [key, description] of Object.entries(KNOWN_FLAGS)) {
    await db.insert(featureFlags).values({ key, enabled: false, description }).onConflictDoNothing();
  }
}
