import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import type { RawOffer } from '@pretoscop/core';
import type { Db, OfferObservation } from '@pretoscop/db';
import type { BlobStore } from '@pretoscop/storage';

/** The subset of @pretoscop/fetch the recorder uses (M02 contract). */
export interface FetchLike {
  fetchPolite(
    url: string,
    opts: { shopSlug?: string; purpose: 'robots' | 'sitemap' | 'listing' | 'product' | 'feed' | 'probe'; runId?: number },
  ): Promise<{
    status: number;
    ok: boolean;
    blocked: boolean;
    blockReason?: string;
    skipped?: string;
    body: string | null;
    finalUrl: string;
    channel: 'direct' | 'assisted';
    error?: string;
    errorCode?: string;
    contentType?: string | null;
  }>;
}

export interface ShopContext {
  id: number;
  slug: string;
  shippingRules: { free_over?: number | null; flat?: number | null; locker_flat?: number | null };
  vatIncludedDefault: boolean;
}

/** RawOffer → observation ready for `recordObservation`, or a reject reason (M06 does the work). */
export type NormalizeFn = (
  raw: RawOffer,
  ctx: { shop: ShopContext; sourceId: number; sourceTier: 1 | 2 | 3 | 4; runId: number | null; observedAt: Date },
) => { observation: OfferObservation; rejectReason?: undefined } | { observation?: undefined; rejectReason: string };

export type OpsAlert = (message: string, details?: Record<string, unknown>) => Promise<void>;

export interface RecorderDeps {
  db: Db;
  env: Env;
  log: Logger;
  blob: BlobStore;
  fetcher: FetchLike;
  normalize: NormalizeFn;
  alert: OpsAlert;
  now?: () => Date;
}
