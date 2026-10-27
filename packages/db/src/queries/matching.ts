import {
  categorize,
  FAMILY_CATEGORIES,
  familyKey,
  familyTitle,
  tokenSets,
  route,
  scorePair,
  TAXONOMY,
  taxonomyPath,
  type MatchSide,
  type PairScore,
  type RoutedDecision,
} from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/** Upserts the launch taxonomy into `categories` (idempotent). */
export async function syncTaxonomy(db: Db): Promise<number> {
  let n = 0;
  for (const [i, node] of TAXONOMY.entries()) {
    const path = taxonomyPath(node.slug);
    await db.execute(sql`
      INSERT INTO categories (slug, name_ro, name_en, depth, path, sort_order, parent_id)
      VALUES (${node.slug}, ${node.nameRo}, ${node.nameEn}, ${path.split('/').length - 1}, ${path}, ${i},
        (SELECT id FROM categories WHERE slug = ${node.parent ?? ''} LIMIT 1))
      ON CONFLICT (path) DO UPDATE SET name_ro = EXCLUDED.name_ro, name_en = EXCLUDED.name_en, sort_order = EXCLUDED.sort_order,
        parent_id = EXCLUDED.parent_id
    `);
    n++;
  }
  return n;
}

export interface PendingOffer {
  id: number;
  shopId: number;
  externalId: string;
  title: string;
  brand: string | null;
  mpnNorm: string | null;
  mpnRaw: string | null;
  mpnSource: string | null;
  gtin14: string | null;
  categoryRaw: string | null;
  attributes: Record<string, unknown>;
  condition: 'new' | 'refurbished' | 'used';
  isBundle: boolean;
  isAccessory: boolean;
  trustTier: number;
}

/**
 * Offers waiting for a decision: never decided (`matched_at` null: new, or identity changed) and,
 * with `reviewAgainAfterHours`, review-queue items last scored longer ago than that (new products
 * may have appeared since).
 */
export async function pendingOffers(
  db: Db,
  limit: number,
  opts: { sourceKey?: string; offerIds?: number[]; reviewAgainAfterHours?: number } = {},
): Promise<PendingOffer[]> {
  const res = await db.execute<{
    id: string; shop_id: string; external_id: string; title: string; brand_name: string | null; mpn_norm: string | null; mpn_raw: string | null; mpn_source: string | null;
    gtin14: string | null; category_raw: string | null; attributes: Record<string, unknown>; condition: 'new' | 'refurbished' | 'used';
    is_bundle: boolean; is_accessory: boolean; trust_tier: number;
  }>(sql`
    SELECT o.id::text, o.shop_id::text, o.external_id, coalesce(o.title_clean, o.title_raw) AS title, o.brand_name, o.mpn_norm, o.mpn_raw, o.mpn_source,
      o.gtin14, o.category_raw, o.attributes, o.condition, o.is_bundle, o.is_accessory, s.trust_tier
    FROM offers o JOIN shops s ON s.id = o.shop_id
    ${opts.sourceKey ? sql`JOIN shop_sources src ON src.id = o.source_id AND src.key = ${opts.sourceKey}` : sql``}
    WHERE o.match_status = 'pending' AND o.active AND NOT o.blacklisted
      ${opts.offerIds ? sql`AND o.id = ANY(${sql.param(opts.offerIds)}::bigint[])` : sql`AND (o.matched_at IS NULL ${
        opts.reviewAgainAfterHours ? sql`OR o.matched_at < now() - make_interval(hours => ${opts.reviewAgainAfterHours}::int)` : sql``
      })`}
    ORDER BY o.first_seen_at
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({
    id: Number(r.id),
    shopId: Number(r.shop_id),
    externalId: r.external_id,
    title: r.title,
    brand: r.brand_name,
    mpnNorm: r.mpn_norm,
    mpnRaw: r.mpn_raw,
    mpnSource: r.mpn_source,
    gtin14: r.gtin14,
    categoryRaw: r.category_raw,
    attributes: r.attributes ?? {},
    condition: r.condition,
    isBundle: r.is_bundle,
    isAccessory: r.is_accessory,
    trustTier: r.trust_tier,
  }));
}

type CandidateRow = {
  id: string;
  title: string;
  brand: string | null;
  mpn_norm: string | null;
  mpn_source: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
  gtins: string[] | null;
  generator: string;
};

/** Candidate products: GTIN, brand + MPN (incl. regional variants), then title trigram within the brand. */
export async function findCandidates(db: Db, o: PendingOffer, category: string | null, titleAscii: string): Promise<Array<{ productId: number; side: MatchSide; generator: string }>> {
  const res = await db.execute<CandidateRow>(sql`
    WITH c AS (
      SELECT g.product_id AS id, 'gtin' AS generator FROM product_gtins g WHERE ${o.gtin14}::text IS NOT NULL AND g.gtin14 = ${o.gtin14}
      UNION
      SELECT p.id, 'brand_mpn' FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE ${o.mpnNorm}::text IS NOT NULL AND ${o.brand}::text IS NOT NULL AND lower(b.name) = lower(${o.brand})
        AND (p.mpn_norm = ${o.mpnNorm}
          OR (length(p.mpn_norm) >= 9 AND length(${o.mpnNorm}) >= 9 AND abs(length(p.mpn_norm) - length(${o.mpnNorm})) <= 4
              AND (starts_with(p.mpn_norm, ${o.mpnNorm}) OR starts_with(${o.mpnNorm}, p.mpn_norm))))
      UNION
      (SELECT p.id, 'title' FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active' AND (${o.brand}::text IS NULL OR lower(b.name) = lower(${o.brand}))
         AND (${category}::text IS NULL OR c.slug IS NULL OR c.slug = ${category})
         AND p.title_ascii % ${titleAscii}
       ORDER BY similarity(p.title_ascii, ${titleAscii}) DESC
       LIMIT 10)
    )
    SELECT p.id::text, p.title, b.name AS brand, p.mpn_norm, p.mpn_source, cat.slug AS category, p.attributes,
      (SELECT array_agg(gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtins,
      string_agg(DISTINCT c.generator, ',') AS generator
    FROM c
    JOIN products p ON p.id = c.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE p.status = 'active'
    GROUP BY p.id, b.name, cat.slug
    LIMIT 15
  `);
  return res.rows.map((r) => ({
    productId: Number(r.id),
    generator: r.generator,
    side: {
      title: r.title,
      brand: r.brand,
      mpnNorm: r.mpn_norm,
      gtin14: o.gtin14 && r.gtins?.includes(o.gtin14) ? o.gtin14 : (r.gtins?.[0] ?? null),
      category: r.category,
      attributes: r.attributes ?? {},
      mpnFromTitle: r.mpn_source === 'title',
    },
  }));
}

export function slugPart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function asciiTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function brandId(db: Db, name: string | null): Promise<number | null> {
  if (!name) return null;
  const slug = slugPart(name);
  if (!slug) return null;
  const res = await db.execute<{ id: string }>(sql`
    INSERT INTO brands (name, slug) VALUES (${name}, ${slug})
    ON CONFLICT (slug) DO UPDATE SET name = brands.name
    RETURNING id::text
  `);
  return Number(res.rows[0]!.id);
}

async function categoryId(db: Db, slug: string | null): Promise<number | null> {
  if (!slug) return null;
  const res = await db.execute<{ id: string }>(sql`SELECT id::text FROM categories WHERE slug = ${slug} LIMIT 1`);
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

/** Variant grouping for phones, tablets, laptops, watches and consoles. */
async function familyId(db: Db, brand: string | null, bId: number | null, cId: number | null, category: string | null, title: string): Promise<number | null> {
  if (!brand || !category || !FAMILY_CATEGORIES.has(category)) return null;
  const key = familyKey(brand, title);
  const slug = `${slugPart(familyTitle(title)) || slugPart(brand)}-${Buffer.from(key).toString('base64url').slice(0, 8).toLowerCase()}`;
  const res = await db.execute<{ id: string }>(sql`
    INSERT INTO product_families (slug, title, brand_id, category_id, attributes)
    VALUES (${slug}, ${familyTitle(title)}, ${bId}, ${cId}, ${JSON.stringify({ key })}::jsonb)
    ON CONFLICT (slug) DO UPDATE SET title = product_families.title
    RETURNING id::text
  `);
  return Number(res.rows[0]!.id);
}

/** Creates the canonical product an offer identifies (provisional unless a trusted source). */
export async function createProductFromOffer(db: Db, o: PendingOffer, category: string | null, createdBy: 'matcher' | 'manual' = 'matcher'): Promise<number> {
  const bId = await brandId(db, o.brand);
  const cId = await categoryId(db, category);
  const fId = await familyId(db, o.brand, bId, cId, category, o.title);
  const ins = await db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, brand_id, category_id, family_id, mpn, mpn_norm, mpn_source, attributes, provisional, created_by)
    VALUES (${`tmp-${o.id}-${Date.now()}`}, ${o.title}, ${asciiTitle(o.title)}, ${bId}, ${cId}, ${fId}, ${o.mpnRaw ?? o.mpnNorm}, ${o.mpnNorm}, ${o.mpnSource},
      ${JSON.stringify(o.attributes)}::jsonb, ${o.trustTier !== 1}, ${createdBy})
    RETURNING id::text
  `);
  const id = Number(ins.rows[0]!.id);
  const slug = `${slugPart(o.title).slice(0, 90).replace(/-+$/g, '')}-${id}`;
  await db.execute(sql`UPDATE products SET slug = ${slug} WHERE id = ${id}`);
  if (o.gtin14) {
    await db.execute(sql`
      INSERT INTO product_gtins (gtin14, product_id, source, confidence) VALUES (${o.gtin14}, ${id}, 'offer', 1)
      ON CONFLICT (gtin14) DO NOTHING
    `);
  }
  return id;
}

export interface MatchOutcome {
  offerId: number;
  decision: RoutedDecision['decision'];
  productId: number | null;
  score: number;
  reasons: string[];
  category: string | null;
}

/**
 * Matches one offer (sticky aliases first, then candidates → score → route) and writes the result:
 * `match_candidates`, an append-only `match_decisions` row, the offer's product link and status.
 * `dryRun` computes the decision without writing anything.
 */
export async function matchOffer(db: Db, o: PendingOffer, opts: { dryRun?: boolean; decidedBy?: string } = {}): Promise<MatchOutcome> {
  const decidedBy = opts.decidedBy ?? 'rule';
  const category = categorize(o.title, o.categoryRaw, { isAccessory: o.isAccessory });

  // Sticky human decisions override every rule (docs/03 §6.3).
  const alias = await db.execute<{ product_id: string | null }>(sql`
    SELECT a.product_id::text FROM offer_aliases a WHERE a.shop_id = ${o.shopId} AND a.external_id = ${o.externalId}
  `);
  if (alias.rows[0]) {
    const target = alias.rows[0].product_id ? await resolveMerged(db, Number(alias.rows[0].product_id)) : null;
    const outcome: MatchOutcome = { offerId: o.id, decision: target ? 'accept' : 'unmatched', productId: target, score: 1, reasons: ['sticky alias'], category };
    if (!opts.dryRun) await writeOutcome(db, o, outcome, [], target ? 'manual' : 'rejected', 'alias');
    return outcome;
  }

  const titleAscii = asciiTitle(o.title);
  const cands = await findCandidates(db, o, category, titleAscii);
  const me: MatchSide = { title: o.title, brand: o.brand, mpnNorm: o.mpnNorm, gtin14: o.gtin14, category, attributes: o.attributes, mpnFromTitle: o.mpnSource === 'title' };
  const scored: Array<{ productId: number; score: PairScore; generator: string }> = cands.map((c) => ({ productId: c.productId, generator: c.generator, score: scorePair(me, c.side) }));
  const routed = route(
    {
      gtin14: o.gtin14,
      mpnNorm: o.mpnNorm,
      brand: o.brand,
      category,
      condition: o.condition,
      isBundle: o.isBundle,
      isAccessory: o.isAccessory,
      trustedSource: o.trustTier === 1,
      hasModelToken: tokenSets(o.title).model.size > 0,
    },
    scored,
  );
  let productId = routed.productId;
  if (routed.decision === 'new_product' && !opts.dryRun) productId = await createProductFromOffer(db, o, category);
  const outcome: MatchOutcome = { offerId: o.id, decision: routed.decision, productId, score: routed.score, reasons: routed.reasons, category };
  if (!opts.dryRun) {
    const status = routed.decision === 'accept' || routed.decision === 'new_product' ? 'auto' : routed.decision === 'needs_review' ? 'pending' : routed.decision === 'reject' ? 'rejected' : 'unmatched';
    await writeOutcome(db, o, outcome, scored, status, decidedBy);
  }
  return outcome;
}

async function resolveMerged(db: Db, productId: number): Promise<number> {
  let id = productId;
  for (let i = 0; i < 5; i++) {
    const r = await db.execute<{ status: string; merged_into_id: string | null }>(sql`SELECT status, merged_into_id::text FROM products WHERE id = ${id}`);
    const row = r.rows[0];
    if (!row || row.status !== 'merged' || !row.merged_into_id) return id;
    id = Number(row.merged_into_id);
  }
  return id;
}

async function writeOutcome(
  db: Db,
  o: PendingOffer,
  out: MatchOutcome,
  scored: Array<{ productId: number; score: PairScore; generator: string }>,
  status: 'auto' | 'manual' | 'pending' | 'unmatched' | 'rejected',
  decidedBy: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM match_candidates WHERE offer_id = ${o.id}`);
    for (const c of scored.sort((a, b) => b.score.score - a.score.score).slice(0, 5)) {
      await tx.execute(sql`
        INSERT INTO match_candidates (offer_id, product_id, score, features, generator)
        VALUES (${o.id}, ${c.productId}, ${c.score.score}, ${JSON.stringify({ ...c.score.features, conflicts: c.score.conflicts, via: c.score.via })}::jsonb,
          ${c.generator.split(',')[0] === 'brand_mpn' ? 'brand_mpn' : c.generator.split(',')[0] === 'gtin' ? 'gtin' : 'title'})
      `);
    }
    const decision = out.decision === 'needs_review' ? 'needs_review' : out.decision === 'new_product' ? 'new_product' : out.decision === 'accept' ? 'accept' : out.decision === 'reject' ? 'reject' : 'unmatched';
    await tx.execute(sql`
      INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
      VALUES (${o.id}, ${out.productId}, ${decision}, ${decidedBy}, ${out.reasons.join('; ').slice(0, 500)}, ${out.score})
    `);
    const linked = status === 'auto' || status === 'manual' ? out.productId : null;
    await tx.execute(sql`
      UPDATE offers SET product_id = ${linked}, match_status = ${status}, match_score = ${out.score},
        match_reason = ${out.reasons.join('; ').slice(0, 300)}, matched_at = now(), category_slug = ${out.category}, updated_at = now()
      WHERE id = ${o.id}
    `);
  });
}

/** Human decision from the review queue (M09): sticky alias + decision + link. */
export async function decideManually(
  db: Db,
  offerId: number,
  action: { kind: 'accept'; productId: number } | { kind: 'reject' } | { kind: 'new_product' },
  actor: string,
): Promise<number | null> {
  const r = await db.execute<{ shop_id: string; external_id: string }>(sql`SELECT shop_id::text, external_id FROM offers WHERE id = ${offerId}`);
  const row = r.rows[0];
  if (!row) return null;
  let productId: number | null = null;
  if (action.kind === 'accept') productId = action.productId;
  if (action.kind === 'new_product') {
    const [o] = await pendingOffersById(db, [offerId]);
    if (!o) return null;
    productId = await createProductFromOffer(db, o, categorize(o.title, o.categoryRaw, { isAccessory: o.isAccessory }), 'manual');
    await db.execute(sql`UPDATE products SET provisional = false WHERE id = ${productId}`);
  }
  await db.execute(sql`
    INSERT INTO offer_aliases (shop_id, external_id, product_id, decided_by) VALUES (${Number(row.shop_id)}, ${row.external_id}, ${productId}, ${actor})
    ON CONFLICT (shop_id, external_id) DO UPDATE SET product_id = EXCLUDED.product_id, decided_by = EXCLUDED.decided_by, created_at = now()
  `);
  await db.execute(sql`
    INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
    VALUES (${offerId}, ${productId}, ${action.kind === 'reject' ? 'reject' : action.kind === 'new_product' ? 'new_product' : 'accept'}, ${actor}, 'human decision', 1)
  `);
  await db.execute(sql`
    UPDATE offers SET product_id = ${productId}, match_status = ${productId ? 'manual' : 'rejected'}, matched_at = now(), updated_at = now() WHERE id = ${offerId}
  `);
  return productId;
}

async function pendingOffersById(db: Db, ids: number[]): Promise<PendingOffer[]> {
  await db.execute(sql`UPDATE offers SET match_status = 'pending' WHERE id = ANY(${sql.param(ids)}::bigint[]) AND match_status <> 'pending'`);
  return pendingOffers(db, ids.length, { offerIds: ids });
}

/** Merge (M09): moves every offer of `from` to `into`, keeps history, logs for undo; old slug redirects. */
export async function mergeProducts(db: Db, fromId: number, intoId: number, actor: string): Promise<number> {
  if (fromId === intoId) return 0;
  return db.transaction(async (tx) => {
    const moved = await tx.execute<{ id: string }>(sql`UPDATE offers SET product_id = ${intoId} WHERE product_id = ${fromId} RETURNING id::text`);
    await tx.execute(sql`UPDATE product_gtins SET product_id = ${intoId} WHERE product_id = ${fromId}`);
    await tx.execute(sql`UPDATE offer_aliases SET product_id = ${intoId} WHERE product_id = ${fromId}`);
    await tx.execute(sql`UPDATE products SET status = 'merged', merged_into_id = ${intoId}, updated_at = now() WHERE id = ${fromId}`);
    await tx.execute(sql`
      INSERT INTO product_merges (from_product_id, into_product_id, moved_offer_ids, actor)
      VALUES (${fromId}, ${intoId}, ${sql.param(moved.rows.map((r) => Number(r.id)))}::bigint[], ${actor})
    `);
    await tx.execute(sql`DELETE FROM product_daily WHERE product_id = ${fromId}`);
    return moved.rows.length;
  });
}

/** Undo of the latest merge of `fromId`: moves the same offers back and reactivates the product. */
export async function undoMerge(db: Db, fromId: number, actor: string): Promise<number> {
  return db.transaction(async (tx) => {
    const m = await tx.execute<{ id: string; into_product_id: string; moved: string[] | null }>(sql`
      SELECT id::text, into_product_id::text, moved_offer_ids::text[] AS moved FROM product_merges
      WHERE from_product_id = ${fromId} AND undone_at IS NULL ORDER BY id DESC LIMIT 1
    `);
    const row = m.rows[0];
    if (!row) return 0;
    const ids = (row.moved ?? []).map(Number);
    if (ids.length > 0) await tx.execute(sql`UPDATE offers SET product_id = ${fromId} WHERE id = ANY(${sql.param(ids)}::bigint[])`);
    await tx.execute(sql`UPDATE products SET status = 'active', merged_into_id = NULL, updated_at = now() WHERE id = ${fromId}`);
    await tx.execute(sql`UPDATE product_merges SET undone_at = now() WHERE id = ${Number(row.id)}`);
    await tx.execute(sql`INSERT INTO audit_log (actor, action, entity, entity_id, after) VALUES (${actor}, 'product.unmerge', 'products', ${String(fromId)}, ${JSON.stringify({ offers: ids })}::jsonb)`);
    return ids.length;
  });
}

/** Per-source match metrics for a day (admin dashboard, weekly audit). */
export async function matchMetrics(db: Db, sinceDays = 1): Promise<Array<{ source: string; decision: string; n: number }>> {
  const res = await db.execute<{ source: string; decision: string; n: string }>(sql`
    SELECT coalesce(s.key, '(no source)') AS source, d.decision, count(*)::text AS n
    FROM match_decisions d JOIN offers o ON o.id = d.offer_id LEFT JOIN shop_sources s ON s.id = o.source_id
    WHERE d.created_at > now() - make_interval(days => ${sinceDays}::int)
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  return res.rows.map((r) => ({ source: r.source, decision: r.decision, n: Number(r.n) }));
}
