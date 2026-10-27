import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvalPair, MatchSide } from '@pretoscop/core';
import { sql, type Db } from '@pretoscop/db';

/** Labelled pairs live next to the harness: packages/core/src/matching-eval/*.json (committed). */
export const EVAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/core/src/matching-eval');

export function loadPairs(): Array<EvalPair & { file: string }> {
  const out: Array<EvalPair & { file: string }> = [];
  for (const f of readdirSync(EVAL_DIR).filter((x) => x.endsWith('.json')).sort()) {
    const pairs = JSON.parse(readFileSync(join(EVAL_DIR, f), 'utf8')) as EvalPair[];
    for (const p of pairs) out.push({ ...p, file: f });
  }
  // A human label overrides an automatic one for the same pair id.
  const human = new Set(out.filter((p) => p.source === 'human').map((p) => p.id));
  return out.filter((p) => p.source === 'human' || !human.has(p.id));
}

type SideRow = {
  title: string;
  brand: string | null;
  mpn_norm: string | null;
  mpn_source: string | null;
  gtin14: string | null;
  category: string | null;
  attributes: Record<string, unknown> | null;
};

export function toSide(r: SideRow): MatchSide {
  return {
    title: r.title,
    brand: r.brand,
    mpnNorm: r.mpn_norm,
    gtin14: r.gtin14,
    category: r.category,
    attributes: r.attributes ?? {},
    mpnFromTitle: r.mpn_source === 'title',
  };
}

/** Offer side as the matcher sees it. */
export async function offerSides(db: Db, ids: number[]): Promise<Map<number, MatchSide>> {
  if (ids.length === 0) return new Map();
  const r = await db.execute<SideRow & { id: string }>(sql`
    SELECT id::text, coalesce(title_clean, title_raw) AS title, brand_name AS brand, mpn_norm, mpn_source, gtin14, category_slug AS category, attributes
    FROM offers WHERE id = ANY(${sql.param(ids)}::bigint[])`);
  return new Map(r.rows.map((x) => [Number(x.id), toSide(x)]));
}

/** Product side as the matcher sees it (first GTIN of the product). */
export async function productSides(db: Db, ids: number[]): Promise<Map<number, MatchSide>> {
  if (ids.length === 0) return new Map();
  const r = await db.execute<SideRow & { id: string }>(sql`
    SELECT p.id::text, p.title, b.name AS brand, p.mpn_norm, p.mpn_source, c.slug AS category, p.attributes,
      (SELECT min(gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtin14
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ANY(${sql.param(ids)}::bigint[])`);
  return new Map(r.rows.map((x) => [Number(x.id), toSide(x)]));
}
