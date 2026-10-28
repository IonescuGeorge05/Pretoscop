import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { asciiTitle, decideManually, slugPart } from './matching';

/**
 * Admin (M09) reads and mutations behind the review queue, product and offer pages. Every mutation
 * returns the before/after state so the caller can write the audit row; none of them touches price
 * history (merges and splits move offers, history stays with the offer).
 */

export interface ReviewCandidate {
  productId: number;
  slug: string;
  title: string;
  status: string;
  score: number;
  generator: string;
  conflicts: string[];
  via: string | null;
  offerCount: number;
  minTotal: string | null;
}

export interface ReviewItem {
  offerId: number;
  shop: string;
  shopName: string;
  url: string;
  title: string;
  brand: string | null;
  mpn: string | null;
  gtin14: string | null;
  price: string;
  total: string;
  condition: string;
  sellerType: string;
  attributes: Record<string, unknown>;
  category: string | null;
  score: number | null;
  reason: string | null;
  firstSeenAt: string;
  candidates: ReviewCandidate[];
}

/**
 * Offers the matcher left in the gray zone (latest decision `needs_review`, status still pending),
 * most valuable first: priority = expected traffic (offers and clicks of the best candidate) ×
 * uncertainty (how close the score is to the middle of the gray zone).
 */
export async function reviewQueue(db: Db, limit = 50): Promise<{ total: number; items: ReviewItem[] }> {
  const total = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM offers WHERE match_status = 'pending' AND matched_at IS NOT NULL AND active AND NOT blacklisted`);
  const rows = await db.execute<{
    id: string; shop: string; shop_name: string; url: string; title: string; brand: string | null; mpn: string | null; gtin14: string | null;
    price: string; total: string; condition: string; seller_type: string; attributes: Record<string, unknown>; category: string | null;
    score: number | null; reason: string | null; first_seen_at: string;
  }>(sql`
    WITH q AS (
      SELECT o.*, s.slug AS shop, s.name AS shop_name,
        (SELECT coalesce(max(p.offer_count), 0) + coalesce(max(c30.n), 0) FROM match_candidates mc
          JOIN products p ON p.id = mc.product_id
          LEFT JOIN LATERAL (SELECT count(*) AS n FROM clicks k WHERE k.product_id = p.id AND k.ts > now() - interval '30 days') c30 ON true
          WHERE mc.offer_id = o.id) AS traffic
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.match_status = 'pending' AND o.matched_at IS NOT NULL AND o.active AND NOT o.blacklisted
    )
    SELECT id::text, shop, shop_name, url, coalesce(title_clean, title_raw) AS title, brand_name AS brand, coalesce(mpn_raw, mpn_norm) AS mpn, gtin14,
      price::text, total_price::text AS total, condition, seller_type, attributes, category_slug AS category, match_score AS score, match_reason AS reason,
      first_seen_at::text
    FROM q
    ORDER BY ln(2 + traffic) * (1 - least(1, abs(coalesce(match_score, 0.64) - 0.64) / 0.34)) DESC, first_seen_at
    LIMIT ${limit}
  `);
  const ids = rows.rows.map((r) => Number(r.id));
  const cands = ids.length
    ? await db.execute<{
        offer_id: string; product_id: string; slug: string; title: string; status: string; score: number; generator: string;
        features: { conflicts?: string[]; via?: string } | null; offer_count: number; min_total: string | null;
      }>(sql`
        SELECT mc.offer_id::text, p.id::text AS product_id, p.slug, p.title, p.status, mc.score, mc.generator, mc.features, p.offer_count, p.min_total_price::text AS min_total
        FROM match_candidates mc JOIN products p ON p.id = mc.product_id
        WHERE mc.offer_id = ANY(${sql.param(ids)}::bigint[]) ORDER BY mc.score DESC`)
    : { rows: [] };
  const byOffer = new Map<number, ReviewCandidate[]>();
  for (const c of cands.rows) {
    const list = byOffer.get(Number(c.offer_id)) ?? [];
    list.push({
      productId: Number(c.product_id),
      slug: c.slug,
      title: c.title,
      status: c.status,
      score: c.score,
      generator: c.generator,
      conflicts: c.features?.conflicts ?? [],
      via: c.features?.via ?? null,
      offerCount: c.offer_count,
      minTotal: c.min_total,
    });
    byOffer.set(Number(c.offer_id), list);
  }
  return {
    total: Number(total.rows[0]?.n ?? 0),
    items: rows.rows.map((r) => ({
      offerId: Number(r.id),
      shop: r.shop,
      shopName: r.shop_name,
      url: r.url,
      title: r.title,
      brand: r.brand,
      mpn: r.mpn,
      gtin14: r.gtin14,
      price: r.price,
      total: r.total,
      condition: r.condition,
      sellerType: r.seller_type,
      attributes: r.attributes ?? {},
      category: r.category,
      score: r.score,
      reason: r.reason,
      firstSeenAt: r.first_seen_at,
      candidates: byOffer.get(Number(r.id)) ?? [],
    })),
  };
}

/** Random sample of automatic matches for the weekly precision audit (founder verification of M07). */
export async function autoMatchSample(db: Db, limit = 10): Promise<Array<{ offerId: number; offerTitle: string; shop: string; productId: number; productTitle: string; slug: string; score: number | null; reason: string | null }>> {
  const r = await db.execute<{ id: string; title: string; shop: string; product_id: string; product_title: string; slug: string; score: number | null; reason: string | null }>(sql`
    SELECT o.id::text, coalesce(o.title_clean, o.title_raw) AS title, s.slug AS shop, p.id::text AS product_id, p.title AS product_title, p.slug,
      o.match_score AS score, o.match_reason AS reason
    FROM offers o JOIN shops s ON s.id = o.shop_id JOIN products p ON p.id = o.product_id
    WHERE o.match_status = 'auto' AND p.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM match_decisions d WHERE d.offer_id = o.id AND d.decided_by LIKE 'human:%')
    ORDER BY random() LIMIT ${limit}`);
  return r.rows.map((x) => ({ offerId: Number(x.id), offerTitle: x.title, shop: x.shop, productId: Number(x.product_id), productTitle: x.product_title, slug: x.slug, score: x.score, reason: x.reason }));
}

export interface ProductRow {
  id: number;
  slug: string;
  title: string;
  status: string;
  provisional: boolean;
  brand: string | null;
  category: string | null;
  offerCount: number;
  minTotal: string | null;
  mpn: string | null;
}

/** Products by id, GTIN, MPN or title words (trigram similarity), active ones first. */
export async function searchProducts(db: Db, q: string, limit = 30, opts: { includeInactive?: boolean } = {}): Promise<ProductRow[]> {
  const term = q.trim();
  const digits = term.replace(/\D/g, '');
  const ascii = asciiTitle(term);
  const idTerm = /^\d{1,12}$/.test(term) ? Number(term) : 0;
  const r = await db.execute<{ id: string; slug: string; title: string; status: string; provisional: boolean; brand: string | null; category: string | null; offer_count: number; min_total: string | null; mpn: string | null }>(sql`
    SELECT p.id::text, p.slug, p.title, p.status, p.provisional, b.name AS brand, c.slug AS category, p.offer_count, p.min_total_price::text AS min_total, p.mpn
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE (${opts.includeInactive ?? false} OR p.status <> 'merged')
      AND (
        ${term === ''}
        OR p.id = ${idTerm}
        OR (${digits.length >= 8} AND EXISTS (SELECT 1 FROM product_gtins g WHERE g.product_id = p.id AND g.gtin14 = lpad(${digits}, 14, '0')))
        OR p.mpn_norm = upper(regexp_replace(${term}, '[^A-Za-z0-9]', '', 'g'))
        OR p.title_ascii % ${ascii}
        OR p.title_ascii LIKE ${`%${ascii}%`}
      )
    ORDER BY (p.id = ${idTerm}) DESC, (p.status = 'active') DESC, similarity(p.title_ascii, ${ascii}) DESC, p.offer_count DESC, p.id DESC
    LIMIT ${limit}
  `);
  return r.rows.map((x) => ({ id: Number(x.id), slug: x.slug, title: x.title, status: x.status, provisional: x.provisional, brand: x.brand, category: x.category, offerCount: x.offer_count, minTotal: x.min_total, mpn: x.mpn }));
}

export interface ProductDetail {
  id: number;
  slug: string;
  title: string;
  status: string;
  provisional: boolean;
  brandId: number | null;
  brand: string | null;
  categoryId: number | null;
  category: string | null;
  familyId: number | null;
  family: string | null;
  mpn: string | null;
  attributes: Record<string, unknown>;
  mergedIntoId: number | null;
  gtins: Array<{ gtin14: string; source: string }>;
  offers: Array<{ id: number; shop: string; title: string; url: string; total: string; availability: string; condition: string; sellerType: string; matchStatus: string; matchReason: string | null; lastCheckedAt: string; blacklisted: boolean; active: boolean }>;
  merges: Array<{ id: number; fromId: number; intoId: number; actor: string; createdAt: string; undoneAt: string | null; direction: 'in' | 'out' }>;
}

export async function productDetail(db: Db, id: number): Promise<ProductDetail | null> {
  const p = await db.execute<{
    id: string; slug: string; title: string; status: string; provisional: boolean; brand_id: string | null; brand: string | null; category_id: string | null; category: string | null;
    family_id: string | null; family: string | null; mpn: string | null; attributes: Record<string, unknown>; merged_into_id: string | null;
  }>(sql`
    SELECT p.id::text, p.slug, p.title, p.status, p.provisional, p.brand_id::text, b.name AS brand, p.category_id::text, c.slug AS category,
      p.family_id::text, f.title AS family, p.mpn, p.attributes, p.merged_into_id::text
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id
    WHERE p.id = ${id}`);
  const row = p.rows[0];
  if (!row) return null;
  const [gtins, offers, merges] = await Promise.all([
    db.execute<{ gtin14: string; source: string }>(sql`SELECT gtin14, source FROM product_gtins WHERE product_id = ${id} ORDER BY gtin14`),
    db.execute<{ id: string; shop: string; title: string; url: string; total: string; availability: string; condition: string; seller_type: string; match_status: string; match_reason: string | null; last_checked_at: string; blacklisted: boolean; active: boolean }>(sql`
      SELECT o.id::text, s.slug AS shop, coalesce(o.title_clean, o.title_raw) AS title, o.url, o.total_price::text AS total, o.availability, o.condition, o.seller_type,
        o.match_status, o.match_reason, o.last_checked_at::text, o.blacklisted, o.active
      FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.product_id = ${id} ORDER BY o.active DESC, o.total_price`),
    db.execute<{ id: string; from_product_id: string; into_product_id: string; actor: string; created_at: string; undone_at: string | null }>(sql`
      SELECT id::text, from_product_id::text, into_product_id::text, actor, created_at::text, undone_at::text FROM product_merges
      WHERE from_product_id = ${id} OR into_product_id = ${id} ORDER BY id DESC LIMIT 20`),
  ]);
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    status: row.status,
    provisional: row.provisional,
    brandId: row.brand_id ? Number(row.brand_id) : null,
    brand: row.brand,
    categoryId: row.category_id ? Number(row.category_id) : null,
    category: row.category,
    familyId: row.family_id ? Number(row.family_id) : null,
    family: row.family,
    mpn: row.mpn,
    attributes: row.attributes ?? {},
    mergedIntoId: row.merged_into_id ? Number(row.merged_into_id) : null,
    gtins: gtins.rows,
    offers: offers.rows.map((o) => ({
      id: Number(o.id),
      shop: o.shop,
      title: o.title,
      url: o.url,
      total: o.total,
      availability: o.availability,
      condition: o.condition,
      sellerType: o.seller_type,
      matchStatus: o.match_status,
      matchReason: o.match_reason,
      lastCheckedAt: o.last_checked_at,
      blacklisted: o.blacklisted,
      active: o.active,
    })),
    merges: merges.rows.map((m) => ({
      id: Number(m.id),
      fromId: Number(m.from_product_id),
      intoId: Number(m.into_product_id),
      actor: m.actor,
      createdAt: m.created_at,
      undoneAt: m.undone_at,
      direction: Number(m.from_product_id) === id ? 'out' : 'in',
    })),
  };
}

export interface ProductEdit {
  title?: string;
  brand?: string | null;
  categorySlug?: string | null;
  familyId?: number | null;
  provisional?: boolean;
}

/** Edits the canonical product; a new title also renames the slug (old slugs keep redirecting by id). */
export async function updateProduct(db: Db, id: number, edit: ProductEdit): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  const cur = await productDetail(db, id);
  if (!cur) return null;
  const before = { title: cur.title, brand: cur.brand, category: cur.category, familyId: cur.familyId, provisional: cur.provisional, slug: cur.slug };
  const title = edit.title?.trim() || cur.title;
  let brandId = cur.brandId;
  if (edit.brand !== undefined) {
    const name = edit.brand?.trim();
    if (!name) brandId = null;
    else {
      const b = await db.execute<{ id: string }>(sql`
        INSERT INTO brands (name, slug) VALUES (${name}, ${slugPart(name)}) ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
      brandId = Number(b.rows[0]!.id);
    }
  }
  let categoryId = cur.categoryId;
  if (edit.categorySlug !== undefined) {
    if (!edit.categorySlug) categoryId = null;
    else {
      const c = await db.execute<{ id: string }>(sql`SELECT id::text FROM categories WHERE slug = ${edit.categorySlug}`);
      if (!c.rows[0]) throw new Error(`unknown category ${edit.categorySlug}`);
      categoryId = Number(c.rows[0].id);
    }
  }
  const familyId = edit.familyId === undefined ? cur.familyId : edit.familyId;
  const provisional = edit.provisional ?? cur.provisional;
  const slug = title === cur.title ? cur.slug : `${slugPart(title).slice(0, 90).replace(/-+$/g, '')}-${id}`;
  await db.execute(sql`
    UPDATE products SET title = ${title}, title_ascii = ${asciiTitle(title)}, slug = ${slug}, brand_id = ${brandId}, category_id = ${categoryId},
      family_id = ${familyId}, provisional = ${provisional}, updated_at = now()
    WHERE id = ${id}`);
  const after = await productDetail(db, id);
  return { before, after: { title: after!.title, brand: after!.brand, category: after!.category, familyId: after!.familyId, provisional: after!.provisional, slug: after!.slug } };
}

export async function setProductStatus(db: Db, id: number, status: 'active' | 'hidden'): Promise<string | null> {
  const r = await db.execute<{ status: string }>(sql`
    UPDATE products p SET status = ${status}, updated_at = now() FROM (SELECT status FROM products WHERE id = ${id}) old
    WHERE p.id = ${id} AND p.status <> 'merged' RETURNING old.status`);
  return r.rows[0]?.status ?? null;
}

/** Adds a validated GTIN-14 to the product (fails if another product owns it). */
export async function addGtin(db: Db, productId: number, gtin14: string): Promise<'added' | 'exists' | 'taken'> {
  const owner = await db.execute<{ product_id: string }>(sql`SELECT product_id::text FROM product_gtins WHERE gtin14 = ${gtin14}`);
  if (owner.rows[0]) return Number(owner.rows[0].product_id) === productId ? 'exists' : 'taken';
  await db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source, confidence) VALUES (${gtin14}, ${productId}, 'manual', 1)`);
  return 'added';
}

export async function removeGtin(db: Db, productId: number, gtin14: string): Promise<boolean> {
  const r = await db.execute<{ gtin14: string }>(sql`DELETE FROM product_gtins WHERE gtin14 = ${gtin14} AND product_id = ${productId} RETURNING gtin14`);
  return r.rows.length > 0;
}

/**
 * Split: moves the chosen offers of `productId` to a new product (same brand, category and family,
 * title from the first moved offer), with sticky aliases so re-matching keeps the human decision.
 */
export async function splitProduct(db: Db, productId: number, offerIds: number[], actor: string, title?: string): Promise<number | null> {
  if (offerIds.length === 0) return null;
  return db.transaction(async (tx) => {
    const src = await tx.execute<{ brand_id: string | null; category_id: string | null; family_id: string | null; attributes: Record<string, unknown> }>(sql`
      SELECT brand_id::text, category_id::text, family_id::text, attributes FROM products WHERE id = ${productId}`);
    const p = src.rows[0];
    if (!p) return null;
    const first = await tx.execute<{ title: string }>(sql`
      SELECT coalesce(title_clean, title_raw) AS title FROM offers WHERE id = ${offerIds[0]!} AND product_id = ${productId}`);
    const newTitle = title?.trim() || first.rows[0]?.title;
    if (!newTitle) return null;
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, brand_id, category_id, family_id, attributes, provisional, created_by)
      VALUES (${`tmp-split-${productId}-${Date.now()}`}, ${newTitle}, ${asciiTitle(newTitle)}, ${p.brand_id}, ${p.category_id}, ${p.family_id},
        ${JSON.stringify(p.attributes ?? {})}::jsonb, false, 'manual')
      RETURNING id::text`);
    const newId = Number(ins.rows[0]!.id);
    await tx.execute(sql`UPDATE products SET slug = ${`${slugPart(newTitle).slice(0, 90).replace(/-+$/g, '')}-${newId}`} WHERE id = ${newId}`);
    const moved = await tx.execute<{ id: string; shop_id: string; external_id: string }>(sql`
      UPDATE offers SET product_id = ${newId}, match_status = 'manual', matched_at = now(), updated_at = now()
      WHERE id = ANY(${sql.param(offerIds)}::bigint[]) AND product_id = ${productId}
      RETURNING id::text, shop_id::text, external_id`);
    for (const o of moved.rows) {
      await tx.execute(sql`
        INSERT INTO offer_aliases (shop_id, external_id, product_id, decided_by) VALUES (${Number(o.shop_id)}, ${o.external_id}, ${newId}, ${actor})
        ON CONFLICT (shop_id, external_id) DO UPDATE SET product_id = EXCLUDED.product_id, decided_by = EXCLUDED.decided_by, created_at = now()`);
      await tx.execute(sql`
        INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score) VALUES (${Number(o.id)}, ${newId}, 'new_product', ${actor}, 'split', 1)`);
    }
    await tx.execute(sql`DELETE FROM product_daily WHERE product_id IN (${productId}, ${newId})`);
    return newId;
  });
}

/** Unlink: the offer leaves its product for good (sticky "no product" alias) until a human links it again. */
export async function unlinkOffer(db: Db, offerId: number, actor: string): Promise<number | null> {
  const r = await db.execute<{ product_id: string | null }>(sql`SELECT product_id::text FROM offers WHERE id = ${offerId}`);
  const before = r.rows[0]?.product_id ? Number(r.rows[0].product_id) : null;
  await decideManually(db, offerId, { kind: 'reject' }, actor);
  return before;
}

/** Blacklist: the external id never appears again (no matching, no product page) until un-blacklisted. */
export async function setOfferBlacklisted(db: Db, offerId: number, blacklisted: boolean): Promise<number | null> {
  const r = await db.execute<{ product_id: string | null }>(sql`
    UPDATE offers o SET blacklisted = ${blacklisted}, product_id = CASE WHEN ${blacklisted} THEN NULL ELSE o.product_id END,
      match_status = CASE WHEN ${blacklisted} THEN 'rejected' ELSE o.match_status END, updated_at = now()
    FROM (SELECT product_id FROM offers WHERE id = ${offerId}) old
    WHERE o.id = ${offerId} RETURNING old.product_id::text`);
  if (!r.rows[0]) return null;
  return r.rows[0].product_id ? Number(r.rows[0].product_id) : null;
}

/** Marks an offer as a bundle or an accessory (leaves the price series) and rejects it as a match. */
export async function markOffer(db: Db, offerId: number, kind: 'bundle' | 'accessory', actor: string): Promise<number | null> {
  const r = await db.execute<{ product_id: string | null }>(sql`SELECT product_id::text FROM offers WHERE id = ${offerId}`);
  if (!r.rows[0]) return null;
  await db.execute(kind === 'bundle' ? sql`UPDATE offers SET is_bundle = true WHERE id = ${offerId}` : sql`UPDATE offers SET is_accessory = true WHERE id = ${offerId}`);
  await decideManually(db, offerId, { kind: 'reject' }, actor);
  return r.rows[0].product_id ? Number(r.rows[0].product_id) : null;
}

export async function listCategories(db: Db): Promise<Array<{ slug: string; name: string; depth: number }>> {
  const r = await db.execute<{ slug: string; name: string; depth: number }>(sql`SELECT slug, name_ro AS name, depth FROM categories ORDER BY path`);
  return r.rows;
}

export interface OfferRow {
  id: number;
  shop: string;
  externalId: string;
  title: string;
  url: string;
  total: string;
  matchStatus: string;
  productId: number | null;
  blacklisted: boolean;
  active: boolean;
  lastCheckedAt: string;
}

/** Offers by id, external id, URL or title words; `blacklisted` lists the blacklist. */
export async function searchOffers(db: Db, q: string, opts: { blacklisted?: boolean; limit?: number } = {}): Promise<OfferRow[]> {
  const term = q.trim();
  const ascii = asciiTitle(term);
  const idTerm = /^\d{1,12}$/.test(term) ? Number(term) : 0;
  const r = await db.execute<{ id: string; shop: string; external_id: string; title: string; url: string; total: string; match_status: string; product_id: string | null; blacklisted: boolean; active: boolean; last_checked_at: string }>(sql`
    SELECT o.id::text, s.slug AS shop, o.external_id, coalesce(o.title_clean, o.title_raw) AS title, o.url, o.total_price::text AS total, o.match_status,
      o.product_id::text, o.blacklisted, o.active, o.last_checked_at::text
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE (${opts.blacklisted ?? false} = false OR o.blacklisted)
      AND (${term === ''} OR o.id = ${idTerm} OR o.external_id = ${term} OR o.url = ${term} OR coalesce(o.title_ascii, lower(o.title_raw)) LIKE ${`%${ascii}%`})
    ORDER BY (o.id = ${idTerm}) DESC, o.last_checked_at DESC
    LIMIT ${opts.limit ?? 60}
  `);
  return r.rows.map((o) => ({
    id: Number(o.id),
    shop: o.shop,
    externalId: o.external_id,
    title: o.title,
    url: o.url,
    total: o.total,
    matchStatus: o.match_status,
    productId: o.product_id ? Number(o.product_id) : null,
    blacklisted: o.blacklisted,
    active: o.active,
    lastCheckedAt: o.last_checked_at,
  }));
}
