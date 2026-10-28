import type { Logger } from '@pretoscop/config/logger';
import { normalizeOffer, type RawOffer, type ShippingRules } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import {
  type Db,
  type MerchantFeedFormat,
  type MerchantFeedReport,
  type MerchantPreviewRow,
  type MerchantPriceFormat,
  type MerchantValidation,
  merchants,
} from '@pretoscop/db';
import { detectFeedFormat, feedText, inspectFeed } from '@pretoscop/extractors';
import type { BlobStore } from '@pretoscop/storage';
import { eq } from 'drizzle-orm';
import type { FetchLike } from '../recorder/types';

export interface MerchantCheckDeps {
  db: Db;
  fetcher: FetchLike;
  blob: BlobStore;
  log: Logger;
  now?: () => Date;
}

/** Offers inspected and normalized per check (the whole feed is ingested only after approval). */
export const VALIDATION_LIMIT = 5000;
export const PREVIEW_SIZE = 20;

class CheckFailure extends Error {
  constructor(
    readonly userMessage: string,
    readonly detail: string,
  ) {
    super(detail);
  }
}

/** Romanian, merchant-facing explanation of a fetch that did not return a feed. */
export function explainFetch(res: Awaited<ReturnType<FetchLike['fetchPolite']>>, url: string): string | null {
  if (res.skipped === 'robots_disallowed') {
    const path = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return '/';
      }
    })();
    return `Fișierul robots.txt al site-ului nu permite robotului PretoscopBot-Feed să citească această adresă. Adaugă în robots.txt liniile „User-agent: PretoscopBot-Feed” și „Allow: ${path}”, apoi verifică din nou.`;
  }
  if (res.skipped === 'access_off' || res.errorCode === 'crawl_disabled') {
    return 'Citirea feed-urilor este oprită temporar pe Pretoscop. Încearcă din nou mai târziu.';
  }
  if (res.errorCode === 'robots_unavailable') {
    return 'Nu am putut citi fișierul robots.txt al serverului care găzduiește feed-ul (eroare sau acces refuzat), iar fără el nu citim nimic de pe acel server.';
  }
  if (res.error && /not a public internet address/.test(res.error)) {
    return 'Adresa feed-ului nu este o adresă publică de internet.';
  }
  if (res.blocked || res.skipped === 'paused') {
    return 'Serverul a refuzat cererea robotului nostru (protecție anti-bot sau limită de acces). Permite accesul pentru User-Agent-ul PretoscopBot-Feed sau încarcă fișierul feed-ului.';
  }
  if (res.errorCode === 'body_too_large') return 'Feed-ul depășește limita de 15 MB. Trimite un feed mai mic (de exemplu, doar produsele în stoc) sau scrie-ne.';
  if (res.errorCode === 'timeout' || res.errorCode === 'connect_timeout') return 'Serverul feed-ului nu a răspuns la timp.';
  if (res.errorCode === 'dns') return 'Domeniul din adresa feed-ului nu există (DNS).';
  if (res.status === 404 || res.status === 410) return `Adresa feed-ului nu există (eroare ${res.status}).`;
  if (res.status >= 400) return `Serverul feed-ului a răspuns cu eroarea ${res.status}.`;
  if (!res.ok || res.status === 0) return 'Nu am putut descărca feed-ul.';
  if (res.body === null) return 'Răspunsul nu este un fișier text (XML sau CSV).';
  return null;
}

function count(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** Normalizes the inspected offers like ingestion would, for the preview and the reject statistics. */
export function normalizationSummary(
  offers: RawOffer[],
  opts: { shippingRules: ShippingRules; priceFormat: MerchantPriceFormat | null; observedAt: Date },
): { normalization: MerchantFeedReport['normalization']; preview: MerchantPreviewRow[] } {
  const normalization = { accepted: 0, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: {} } as MerchantFeedReport['normalization'];
  const preview: MerchantPreviewRow[] = [];
  for (const raw of offers) {
    const n = normalizeOffer(raw, {
      shop: { slug: raw.shopSlug, shippingRules: opts.shippingRules, vatIncludedDefault: true, priceFormat: opts.priceFormat },
      observedAt: opts.observedAt,
      hash: contentHash,
    });
    if (n.ok) {
      normalization.accepted++;
      count(normalization.shippingBasis, n.shippingBasis);
    } else {
      normalization.rejected++;
      for (const r of n.rejects) count(normalization.rejectReasons, r);
    }
    for (const w of n.warnings) count(normalization.warnings, w.replace(/:.*$/, ''));
    if (preview.length < PREVIEW_SIZE) {
      preview.push({
        externalId: raw.externalId,
        title: n.titleClean || raw.title,
        url: raw.url,
        priceBani: n.ok ? n.priceBani : null,
        oldPriceBani: n.oldPriceBani,
        shippingBani: n.totalShippingBani,
        totalBani: n.ok ? n.totalBani : null,
        shippingBasis: n.shippingBasis,
        availability: n.availability,
        condition: n.condition,
        gtin: n.gtin14,
        brand: n.brandName,
        rejects: n.ok ? [] : [...n.rejects],
        warnings: [...n.warnings],
      });
    }
  }
  return { normalization, preview };
}

async function loadFeed(deps: MerchantCheckDeps, m: typeof merchants.$inferSelect): Promise<{ text: string; source: 'url' | 'upload' }> {
  if (m.feedUploadKey && !m.feedUrl) {
    const data = await deps.blob.get(m.feedUploadKey);
    if (!data) throw new CheckFailure('Fișierul încărcat nu mai există. Încarcă-l din nou.', `blob ${m.feedUploadKey} missing`);
    return { text: await feedText(data), source: 'upload' };
  }
  if (!m.feedUrl) throw new CheckFailure('Adaugă mai întâi adresa feed-ului sau încarcă un fișier.', 'no feed configured');
  const res = await deps.fetcher.fetchPolite(m.feedUrl, { shopSlug: `merchant-${m.id}`, purpose: 'feed' });
  const problem = explainFetch(res, m.feedUrl);
  if (problem) {
    throw new CheckFailure(problem, `status=${res.status} skipped=${res.skipped ?? '-'} blocked=${res.blocked} code=${res.errorCode ?? '-'} ${res.error ?? ''}`.trim());
  }
  return { text: res.body!, source: 'url' };
}

async function save(db: Db, id: number, validation: MerchantValidation, feedFormat?: MerchantFeedFormat): Promise<void> {
  await db
    .update(merchants)
    .set({ validation, ...(feedFormat ? { feedFormat } : {}) })
    .where(eq(merchants.id, id));
}

/**
 * Worker job `merchant.validate`: fetch the merchant's feed (identified as PretoscopBot-Feed, robots.txt
 * obeyed, private addresses refused) or read the uploaded file, inspect up to 5,000 offers, normalize
 * them like ingestion would, and store the report on the merchant. Never throws for feed problems:
 * they become the Romanian `error` the portal shows.
 */
export async function validateMerchantFeed(deps: MerchantCheckDeps, merchantId: number): Promise<MerchantValidation> {
  const [m] = await deps.db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new Error(`merchant ${merchantId} not found`);
  const requestedAt = m.validation?.requestedAt ?? new Date().toISOString();
  await save(deps.db, m.id, { status: 'running', requestedAt });
  const now = deps.now?.() ?? new Date();
  try {
    const { text, source } = await loadFeed(deps, m);
    const detected = detectFeedFormat(text.slice(0, 4096));
    const format = (m.feedFormat ?? detected) as MerchantFeedFormat | null;
    if (!format) {
      throw new CheckFailure(
        'Nu am recunoscut formatul. Acceptăm feed-uri Google Merchant (XML), compari.ro (XML) sau CSV cu un rând de antet.',
        `unrecognized format; first bytes: ${JSON.stringify(text.slice(0, 80))}`,
      );
    }
    const inspection = await inspectFeed(text, { format, domain: m.domain, limit: VALIDATION_LIMIT, sampleSize: PREVIEW_SIZE, shopSlug: `merchant-${m.id}` });
    const verdict = inspection.priceFormat.verdict;
    const effective: MerchantPriceFormat | null = m.priceFormat ?? (verdict === 'ro' ? 'ro' : verdict === 'decimal' ? 'decimal' : null);
    const { normalization, preview } = normalizationSummary(inspection.all, { shippingRules: m.shippingRules ?? {}, priceFormat: effective, observedAt: now });
    const report: MerchantFeedReport = {
      source,
      fetchedAt: now.toISOString(),
      bytes: Buffer.byteLength(text),
      format,
      detectedFormat: detected,
      parserKey: inspection.parserKey,
      offers: inspection.offers,
      rows: inspection.rows,
      skippedRows: inspection.skippedRows,
      truncated: inspection.truncated,
      fields: inspection.fields,
      priceFormat: {
        verdict,
        ambiguousExamples: inspection.priceFormat.ambiguousExamples,
        effective,
        needsChoice: (verdict === 'ambiguous' || verdict === 'mixed') && !m.priceFormat,
      },
      vat: inspection.vat,
      currencies: inspection.currencies,
      domain: inspection.domain,
      duplicateIds: inspection.duplicateIds,
      parseError: inspection.parseError,
      normalization,
      preview,
    };
    const validation: MerchantValidation =
      inspection.offers === 0
        ? {
            status: 'failed',
            requestedAt,
            finishedAt: new Date().toISOString(),
            error: inspection.parseError
              ? 'Feed-ul nu poate fi citit: structura XML sau CSV este greșită.'
              : 'Nu am găsit niciun produs complet (titlu, adresă și preț) în feed.',
            detail: inspection.parseError ?? `rows=${inspection.rows}`,
            report,
          }
        : { status: 'done', requestedAt, finishedAt: new Date().toISOString(), report };
    await save(deps.db, m.id, validation, m.feedFormat ? undefined : format);
    deps.log.info({ merchant_id: m.id, status: validation.status, offers: inspection.offers, accepted: normalization.accepted }, 'merchant feed checked');
    return validation;
  } catch (err) {
    const failure: MerchantValidation =
      err instanceof CheckFailure
        ? { status: 'failed', requestedAt, finishedAt: new Date().toISOString(), error: err.userMessage, detail: err.detail }
        : { status: 'failed', requestedAt, finishedAt: new Date().toISOString(), error: 'Verificarea a eșuat din cauza unei erori la noi. Încearcă din nou.', detail: (err as Error).message };
    await save(deps.db, m.id, failure);
    deps.log.warn({ merchant_id: m.id, detail: failure.detail }, 'merchant feed check failed');
    return failure;
  }
}
