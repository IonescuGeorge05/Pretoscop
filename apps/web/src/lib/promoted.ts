import 'server-only';
import { isFlagEnabled, merchantPlacementCategories, productCategoryChain, promotedSlot, type PromotedSlotData } from '@pretoscop/db';
import { paymentProviderFromEnv, type PaymentProvider } from '@pretoscop/payments';
import { revalidateTag, unstable_cache } from 'next/cache';
import { adsBuildEnabled } from './csp';
import { db, serverEnv } from './db';
import { boss } from './jobs';

/**
 * Promoted placements in the web app (M25, ADR-026): the cached slot data of product and category
 * pages, the cache tags that refresh them, and the payment provider of wallet top-ups.
 *
 * Cache tags. A product page's slot is tagged `promoted`, `product:{id}` and `promoted:c{id}` for
 * every category on the product's chain (leaf to root); a category page's slot `promoted` and
 * `promoted:categorii`. A change of one merchant (campaign edited, budget used up, top-up,
 * suspension) refreshes `promoted:c{target}` for each of its campaign targets plus the category
 * pages; a site-wide change (flag, floors) refreshes `promoted`. Billing never trusts what a page
 * showed: the auction runs again at click time, so a cached slot can only show too much, never
 * charge too much.
 */

export const PROMOTED_PATH = '/pentru-magazine/cont/promovare';
/** Slots recompute at least this often (a freshness SLO that runs out, a midnight cap reset). */
const SLOT_REVALIDATE_SECONDS = 900;
export const PROMOTED_REFRESH_JOB = 'promoted.refresh';

export function promotedEnabled(): Promise<boolean> {
  return isFlagEnabled(db(), 'promoted.enabled');
}

function chainOf(productId: number): Promise<number[]> {
  return unstable_cache(() => productCategoryChain(db(), productId), ['promoted-chain', String(productId)], { tags: [`product:${productId}`], revalidate: 3600 })();
}

/** The "Promovat" slot above a product's offers table (null: flag off or no eligible campaign). */
export async function productPromotedSlot(productId: number): Promise<PromotedSlotData | null> {
  const chain = await chainOf(productId);
  return unstable_cache(
    async () => ((await promotedEnabled()) ? promotedSlot(db(), { slot: 'product', productId }) : null),
    ['promoted-slot', 'product', String(productId)],
    { tags: ['promoted', `product:${productId}`, ...chain.map((c) => `promoted:c${c}`)], revalidate: SLOT_REVALIDATE_SECONDS },
  )();
}

/** The "Promovat" slot above a category page's products (first page only). */
export function categoryPromotedSlot(categoryId: number): Promise<PromotedSlotData | null> {
  return unstable_cache(
    async () => ((await promotedEnabled()) ? promotedSlot(db(), { slot: 'category', categoryId }) : null),
    ['promoted-slot', 'category', String(categoryId)],
    { tags: ['promoted', 'promoted:categorii'], revalidate: SLOT_REVALIDATE_SECONDS },
  )();
}

/**
 * What the transparency pages (/cum-functioneaza, /cum-castigam-bani, /cookies) must say today:
 * whether promoted placements and the ad slot are switched on. Tagged `promoted`, so a flag toggle
 * refreshes those pages too.
 */
export async function monetizationState(): Promise<{ promoted: boolean; ads: boolean }> {
  const off = { promoted: false, ads: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A build without a reachable database must still render the page (saying "off").
  const timeout = new Promise<typeof off>((resolve) => {
    timer = setTimeout(() => resolve(off), 3000);
  });
  const state = unstable_cache(
    async () => {
      const [promoted, ads] = await Promise.all([promotedEnabled(), isFlagEnabled(db(), 'ads.slots.enabled')]);
      return { promoted, ads: ads && adsBuildEnabled(process.env.NEXT_PUBLIC_ADSENSE_CLIENT) };
    },
    ['monetization-state'],
    { tags: ['promoted'], revalidate: 3600 },
  )().catch(() => off);
  try {
    return await Promise.race([state, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tags to refresh after a change of one merchant's campaigns or budget. */
export async function merchantPromotedTags(merchantId: number): Promise<string[]> {
  const targets = await merchantPlacementCategories(db(), merchantId);
  return [...targets.map((c) => `promoted:c${c}`), 'promoted:categorii'];
}

/**
 * Refreshes promoted slots: this replica's cache at once, the other replicas through the worker
 * (job `promoted.refresh`, which posts the tags to every replica). Best effort: a failure only
 * leaves a slot showing until its 15-minute recompute, and billing re-checks everything anyway.
 */
export async function refreshPromoted(tags: string[]): Promise<void> {
  const unique = [...new Set(tags)].filter((t) => /^[a-z]+(?::[\w-]+)?$/.test(t));
  if (unique.length === 0) return;
  for (const t of unique) revalidateTag(t, { expire: 0 });
  try {
    const b = await boss();
    await b.send(PROMOTED_REFRESH_JOB, { tags: unique }, { retryLimit: 2, expireInSeconds: 300 });
  } catch {
    // No worker queue in this environment (local e2e): this replica is already refreshed.
  }
}

export async function refreshPromotedForMerchant(merchantId: number): Promise<void> {
  await refreshPromoted(await merchantPromotedTags(merchantId));
}

/** The configured payment provider (Stripe), or null: then the portal offers bank transfer only. */
export function paymentProvider(): PaymentProvider | null {
  return paymentProviderFromEnv(serverEnv());
}

export function logPromoted(event: string, fields: Record<string, unknown>, err?: unknown): void {
  const line = { level: err ? 'error' : 'info', service: 'web.promoted', event, ...fields, ...(err ? { error: err instanceof Error ? err.message : String(err) } : {}), time: new Date().toISOString() };
  (err ? console.error : console.log)(JSON.stringify(line));
}
