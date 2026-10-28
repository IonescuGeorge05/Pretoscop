import type { Logger } from '@pretoscop/config/logger';
import { hostOnShopDomain, normalizeOffer, type RawOffer, type ShippingRules } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import {
  type Db,
  feedTargetOf,
  foreignShopForHost,
  MERCHANT_FEED_PARSERS,
  type MerchantFeedFormat,
  type MerchantFeedReport,
  type MerchantFeedTarget,
  type MerchantPreviewRow,
  type MerchantPriceFormat,
  type MerchantValidation,
  merchants,
  saveMerchantValidation,
  sql,
} from '@pretoscop/db';
import { detectFeedFormat, feedText, inspectFeed } from '@pretoscop/extractors';
import type { BlobStore } from '@pretoscop/storage';
import { eq } from 'drizzle-orm';
import type { FetchLike } from '../recorder/types';
import { FeedTooLargeError, readUploadedFeed } from './upload';

export interface MerchantCheckDeps {
  db: Db;
  /** The merchant-scoped fetcher (services.merchantFetcher): its refusals never pause the crawler. */
  fetcher: FetchLike;
  blob: BlobStore;
  log: Logger;
  now?: () => Date;
  /** Cap on a feed body after decoding (env FETCH_MAX_BODY_BYTES; uploads are held to it too). */
  maxBytes?: number;
}

/** Offers inspected and normalized per check (the whole feed is ingested only after approval). */
export const VALIDATION_LIMIT = 5000;
export const PREVIEW_SIZE = 20;
export const DEFAULT_FEED_MAX_BYTES = 15 * 1024 * 1024;
/** Reject reason of an offer whose product URL is not on the verified shop domain. */
export const OFF_DOMAIN_REJECT = 'off_domain';

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
  // The SSRF guard refuses before robots.txt can even be read: say so, not "robots.txt".
  if (res.errorCode === 'non_public_address' || (res.error && /not a public internet address/.test(res.error))) {
    return 'Adresa feed-ului nu este o adresă publică de internet.';
  }
  if (res.skipped === 'robots_disallowed' && res.errorCode !== 'robots_unavailable') {
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

/**
 * Normalizes the inspected offers like ingestion would, for the preview and the reject statistics.
 * An offer whose product URL is not on the shop domain counts as rejected (`off_domain`): ingestion
 * drops it, so it must never be counted as listable.
 */
export function normalizationSummary(
  offers: RawOffer[],
  opts: { shippingRules: ShippingRules; priceFormat: MerchantPriceFormat | null; observedAt: Date; domain?: string | null },
): { normalization: MerchantFeedReport['normalization']; preview: MerchantPreviewRow[] } {
  const normalization = { accepted: 0, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: {} } as MerchantFeedReport['normalization'];
  const preview: MerchantPreviewRow[] = [];
  for (const raw of offers) {
    const n = normalizeOffer(raw, {
      shop: { slug: raw.shopSlug, shippingRules: opts.shippingRules, vatIncludedDefault: true, priceFormat: opts.priceFormat },
      observedAt: opts.observedAt,
      hash: contentHash,
    });
    const rejects: string[] = n.ok ? [] : n.rejects.length > 0 ? [...n.rejects] : ['rejected'];
    if (opts.domain && !onDomain(raw.url, opts.domain)) rejects.push(OFF_DOMAIN_REJECT);
    if (rejects.length === 0) {
      normalization.accepted++;
      count(normalization.shippingBasis, n.shippingBasis);
    } else {
      normalization.rejected++;
      for (const r of rejects) count(normalization.rejectReasons, r);
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
        rejects,
        warnings: [...n.warnings],
      });
    }
  }
  return { normalization, preview };
}

function onDomain(url: string, domain: string): boolean {
  try {
    return hostOnShopDomain(new URL(url).hostname, domain);
  } catch {
    return false;
  }
}

async function loadFeed(deps: MerchantCheckDeps, m: typeof merchants.$inferSelect): Promise<{ text: string; source: 'url' | 'upload' }> {
  const maxBytes = deps.maxBytes ?? DEFAULT_FEED_MAX_BYTES;
  if (m.feedUploadKey && !m.feedUrl) {
    let data: Uint8Array | null;
    try {
      data = await readUploadedFeed(deps.blob, m.feedUploadKey, maxBytes);
    } catch (err) {
      if (err instanceof FeedTooLargeError) {
        throw new CheckFailure('Fișierul depășește limita de 15 MB (după dezarhivare). Trimite un feed mai mic sau o adresă.', err.message);
      }
      throw new CheckFailure('Fișierul încărcat nu poate fi dezarhivat. Încarcă un fișier .gz valid sau unul necomprimat.', (err as Error).message);
    }
    if (!data) throw new CheckFailure('Fișierul încărcat nu mai există. Încarcă-l din nou.', `blob ${m.feedUploadKey} missing`);
    return { text: await feedText(data), source: 'upload' };
  }
  if (!m.feedUrl) throw new CheckFailure('Adaugă mai întâi adresa feed-ului sau încarcă un fișier.', 'no feed configured');
  const host = new URL(m.feedUrl).hostname;
  const foreign = await foreignShopForHost(deps.db, host, { merchantId: m.id, domain: m.domain, domainVerified: Boolean(m.domainVerifiedAt) });
  if (foreign) {
    throw new CheckFailure(
      `Adresa feed-ului este pe site-ul ${foreign.domain}, al unui magazin pe care îl urmărim deja. Dacă este magazinul tău, verifică mai întâi domeniul ${foreign.domain} (pasul 2); altfel folosește o adresă de pe domeniul tău sau încarcă fișierul.`,
      `feed host ${host} belongs to the registered shop ${foreign.slug}`,
    );
  }
  const res = await deps.fetcher.fetchPolite(m.feedUrl, { shopSlug: `merchant-${m.id}`, purpose: 'feed' });
  const problem = explainFetch(res, m.feedUrl);
  if (problem) {
    throw new CheckFailure(problem, `status=${res.status} skipped=${res.skipped ?? '-'} blocked=${res.blocked} code=${res.errorCode ?? '-'} ${res.error ?? ''}`.trim());
  }
  return { text: res.body!, source: 'url' };
}

/**
 * Worker job `merchant.feed_check`: fetch the merchant's feed (identified as PretoscopBot-Feed,
 * robots.txt obeyed, private addresses and the hosts of shops we crawl refused, through the
 * merchant-scoped fetch state) or read the uploaded file (decoded size capped), inspect up to 5,000
 * offers, normalize them like ingestion would, and store the report on the merchant, stamped with
 * the feed and domain it is about. The report is dropped when a newer check was asked for or the
 * feed or domain changed meanwhile. Never throws for feed problems: they become the Romanian
 * `error` the portal shows.
 */
export async function validateMerchantFeed(deps: MerchantCheckDeps, merchantId: number): Promise<MerchantValidation> {
  const [m] = await deps.db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new Error(`merchant ${merchantId} not found`);
  const requestedAt = m.validation?.requestedAt ?? new Date().toISOString();
  const target: MerchantFeedTarget = feedTargetOf(m);
  await deps.db.execute(sql`
    UPDATE merchants SET validation = ${JSON.stringify({ status: 'running', requestedAt, target } satisfies MerchantValidation)}::jsonb
    WHERE id = ${m.id} AND (validation IS NULL OR validation->>'requestedAt' = ${requestedAt})`);
  const now = deps.now?.() ?? new Date();
  let validation: MerchantValidation & { target: MerchantFeedTarget };
  let format: MerchantFeedFormat | null = null;
  try {
    const { text, source } = await loadFeed(deps, m);
    const detected = detectFeedFormat(text.slice(0, 4096));
    format = (m.feedFormat ?? detected) as MerchantFeedFormat | null;
    if (!format) {
      throw new CheckFailure(
        'Nu am recunoscut formatul. Acceptăm feed-uri Google Merchant (XML), compari.ro (XML) sau CSV cu un rând de antet.',
        `unrecognized format; first bytes: ${JSON.stringify(text.slice(0, 80))}`,
      );
    }
    const inspection = await inspectFeed(text, { format, domain: m.domain, limit: VALIDATION_LIMIT, sampleSize: PREVIEW_SIZE, shopSlug: `merchant-${m.id}` });
    const verdict = inspection.priceFormat.verdict;
    const effective: MerchantPriceFormat | null = m.priceFormat ?? (verdict === 'ro' ? 'ro' : verdict === 'decimal' ? 'decimal' : null);
    const { normalization, preview } = normalizationSummary(inspection.all, {
      shippingRules: m.shippingRules ?? {},
      priceFormat: effective,
      observedAt: now,
      domain: m.domain,
    });
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
    validation =
      inspection.offers === 0
        ? {
            status: 'failed',
            requestedAt,
            finishedAt: new Date().toISOString(),
            target,
            error: inspection.parseError
              ? 'Feed-ul nu poate fi citit: structura XML sau CSV este greșită.'
              : 'Nu am găsit niciun produs complet (titlu, adresă și preț) în feed.',
            detail: inspection.parseError ?? `rows=${inspection.rows}`,
            report,
          }
        : { status: 'done', requestedAt, finishedAt: new Date().toISOString(), target, report };
  } catch (err) {
    validation =
      err instanceof CheckFailure
        ? { status: 'failed', requestedAt, finishedAt: new Date().toISOString(), target, error: err.userMessage, detail: err.detail }
        : {
            status: 'failed',
            requestedAt,
            finishedAt: new Date().toISOString(),
            target,
            error: 'Verificarea a eșuat din cauza unei erori la noi. Încearcă din nou.',
            detail: (err as Error).message,
          };
  }
  const detectedFormat = !m.feedFormat && format ? format : undefined;
  const stored = await saveMerchantValidation(deps.db, m.id, validation, detectedFormat);
  // A listed merchant who chose "detect automatically": the live source must read the feed with the
  // parser of the format found now, not with the one of the previous feed.
  if (stored && detectedFormat && validation.status === 'done' && (m.status === 'approved' || m.status === 'suspended')) {
    await deps.db.execute(sql`
      UPDATE shop_sources SET parser_key = ${MERCHANT_FEED_PARSERS[detectedFormat]}, format = ${detectedFormat}, updated_at = now()
      WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id} AND parser_key IS DISTINCT FROM ${MERCHANT_FEED_PARSERS[detectedFormat]}`);
  }
  const level = validation.status === 'done' ? 'info' : 'warn';
  deps.log[level](
    { merchant_id: m.id, status: validation.status, stored, offers: validation.report?.offers ?? 0, accepted: validation.report?.normalization.accepted ?? 0, detail: validation.detail },
    stored ? 'merchant feed checked' : 'merchant feed check superseded (feed, domain or request changed): result dropped',
  );
  return validation;
}
