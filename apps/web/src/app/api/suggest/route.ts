import { cleanQuery, suggest } from '@pretoscop/search';
import { formatLei, plural } from '@/lib/format';
import { meili, names } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SuggestResponse {
  q: string;
  products: Array<{ href: string; title: string; price: string | null; shops: number }>;
  categories: Array<{ href: string; name: string; parent: string | null; count: string }>;
  brands: Array<{ href: string; name: string; count: string }>;
}

const EMPTY = (q: string): SuggestResponse => ({ q, products: [], categories: [], brands: [] });

/**
 * GET /api/suggest?q= — autocomplete for the header search box (M14 contract): up to 6 products,
 * 3 categories and 3 brands, prefix match on the last word. Prices are formatted here so the
 * client component stays tiny. Short public caching: the answer is the same for everyone.
 */
export async function GET(req: Request): Promise<Response> {
  const q = cleanQuery(new URL(req.url).searchParams.get('q')).slice(0, 80);
  const headers = { 'cache-control': 'public, max-age=60, s-maxage=300', 'x-robots-tag': 'noindex' };
  if (q.length < 2) return Response.json(EMPTY(q), { headers });
  try {
    const s = await suggest(meili(), names(), q);
    const body: SuggestResponse = {
      q,
      products: s.products.map((p) => ({
        href: `/p/${p.slug}`,
        title: p.title,
        price: p.in_stock && p.min_total_bani !== null ? formatLei(p.min_total_bani) : null,
        shops: p.shop_count,
      })),
      categories: s.categories.map((c) => ({ href: `/c/${c.path}`, name: c.name, parent: c.parent_name, count: plural(c.product_count, 'produs', 'produse') })),
      brands: s.brands.map((b) => ({ href: `/b/${b.slug}`, name: b.name, count: plural(b.product_count, 'produs', 'produse') })),
    };
    return Response.json(body, { headers });
  } catch {
    return Response.json(EMPTY(q), { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
