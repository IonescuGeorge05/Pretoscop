import { z } from 'zod';

/**
 * B2B API v1 contract (M28): the zod schemas below are the single source of truth. Responses are
 * validated against them in the contract tests, and `openApiDocument()` turns them into the
 * published OpenAPI 3.1 file (`docs/api/b2b-v1.openapi.json`, served at
 * /api/v1/b2b/openapi.json; a test fails when the committed file drifts). Objects are closed
 * (`additionalProperties: false`): a field nobody declared (Icecat content, personal data) fails
 * the contract tests instead of leaking.
 */

export const registry = z.registry<{ id: string }>();
function named<T extends z.ZodType>(id: string, schema: T): T {
  registry.add(schema, { id });
  return schema;
}

const Lei = z.string().regex(/^-?\d+\.\d{2}$/).describe('Amount in lei (RON) including VAT, as a decimal string');
const Time = z.iso.datetime().describe('UTC timestamp, ISO 8601');
const Day = z.iso.date().describe('Europe/Bucharest calendar day');

export const ErrorBody = named(
  'Error',
  z.object({
    error: z.object({
      code: z.enum([
        'unauthorized',
        'workspace_inactive',
        'terms_not_accepted',
        'plan_without_api',
        'rate_limited',
        'quota_exceeded',
        'not_found',
        'invalid_request',
        'sku_limit',
        'unavailable',
      ]),
      message: z.string(),
    }),
  }),
);

export const Product = named(
  'Product',
  z.object({
    id: z.number().int(),
    title: z.string(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    url: z.string().describe('Public Pretoscop product page'),
  }),
);

export const Sku = named(
  'Sku',
  z.object({
    id: z.number().int(),
    ref: z.string().nullable().describe('Your own code'),
    label: z.string().nullable(),
    gtin: z.string().nullable().describe('GTIN-14'),
    mpn: z.string().nullable(),
    brand: z.string().nullable().describe('Brand as you gave it'),
    status: z.enum(['matched', 'unmatched', 'ambiguous']),
    reference_price: Lei.nullable().describe('Your own or recommended price'),
    product: Product.nullable(),
  }),
);

export const Offer = named(
  'Offer',
  z.object({
    shop: z.string(),
    seller: z.string().nullable().describe('Third-party seller on a marketplace'),
    seller_type: z.enum(['shop', 'marketplace']),
    url: z.string(),
    price: Lei,
    shipping: Lei.nullable(),
    total: Lei,
    availability: z.enum(['in_stock', 'out_of_stock', 'preorder', 'unknown']),
    condition: z.enum(['new', 'refurbished', 'used']),
    last_checked_at: Time,
    stale: z.boolean().describe('Older than the shop’s usual refresh interval'),
    comparable: z.boolean().describe('Counts for min/median: fresh, in stock, new, no bundle, no price under review'),
  }),
);

export const Position = named(
  'Position',
  z.object({
    sku: Sku,
    own: z
      .object({
        basis: z.enum(['offer', 'reference']),
        total: Lei,
        offer: Offer.nullable(),
      })
      .nullable(),
    market: z.object({
      min: Lei.nullable(),
      median: Lei.nullable(),
      competitors: z.number().int(),
      cheapest_shop: z.string().nullable(),
    }),
    rank: z.number().int().nullable().describe('1 = lowest total; ties share a rank'),
    gap_to_min_pct: z.number().nullable(),
    status: z.enum(['cheapest', 'tied', 'above', 'alone', 'no_price', 'no_data']),
    oldest_check_at: Time.nullable(),
    newest_check_at: Time.nullable(),
  }),
);

export const PositionDetail = named('PositionDetail', Position.extend({ offers: z.array(Offer) }));

const page = <T extends z.ZodType>(id: string, item: T) =>
  named(id, z.object({ data: z.array(item), total: z.number().int(), limit: z.number().int(), offset: z.number().int() }));

export const SkuPage = page('SkuPage', Sku);
export const PositionPage = page('PositionPage', Position);

export const PositionDetailBody = named('PositionDetailBody', z.object({ data: PositionDetail }));

export const SkuInput = named(
  'SkuInput',
  z.object({
    gtin: z.string().max(20).nullish(),
    mpn: z.string().max(200).nullish(),
    brand: z.string().max(200).nullish(),
    ref: z.string().max(200).nullish(),
    label: z.string().max(200).nullish(),
    reference_price: z.string().max(30).nullish().describe('"1234.56" or "1.234,56"'),
  }),
);
export const SkuImportRequest = named('SkuImportRequest', z.object({ skus: z.array(SkuInput).min(1).max(1000) }));
export const SkuImportResult = named(
  'SkuImportResult',
  z.object({
    added: z.number().int(),
    matched: z.number().int(),
    unmatched: z.number().int(),
    ambiguous: z.number().int(),
    duplicates: z.number().int(),
    invalid: z.number().int(),
    over_limit: z.number().int(),
    errors: z.array(z.object({ index: z.number().int(), message: z.string() })),
  }),
);

export const Change = named(
  'Change',
  z.object({
    sku_id: z.number().int(),
    ref: z.string().nullable(),
    label: z.string(),
    shop: z.string(),
    seller: z.string().nullable(),
    own: z.boolean(),
    observed_at: Time,
    before: z.object({ total: Lei, availability: z.string() }).nullable().describe('null: first time we saw this offer'),
    after: z.object({ total: Lei, availability: z.string() }),
  }),
);
export const ChangePage = named('ChangePage', z.object({ data: z.array(Change), total: z.number().int(), since: Time, until: Time }));

const Series = z.array(z.tuple([Day, Lei]));
export const History = named(
  'History',
  z.object({
    data: z.object({
      range: z.enum(['30d', '90d', '1y', 'all']),
      min: Series.describe('Daily lowest total across shops (shop-sold offers)'),
      marketplace: Series,
      shops: z.record(z.string(), z.object({ name: z.string(), series: Series })),
    }),
  }),
);

export const Usage = named(
  'Usage',
  z.object({
    plan: z.enum(['pilot', 'starter', 'pro', 'enterprise']),
    quota: z.object({ limit: z.number().int(), used: z.number().int(), remaining: z.number().int(), resets_at: Time }),
    per_minute: z.number().int(),
    skus: z.object({ limit: z.number().int(), used: z.number().int() }),
    days: z.array(z.object({ day: Day, requests: z.number().int(), refused: z.number().int() })),
  }),
);

function components(): Record<string, unknown> {
  const out = z.toJSONSchema(registry, { uri: (id) => `#/components/schemas/${id}` }) as { schemas: Record<string, Record<string, unknown>> };
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const o = { ...(node as Record<string, unknown>) };
    delete o.$schema;
    delete o.$id;
    // zod spells out ISO date patterns in full; `format` says the same.
    if (o.format === 'date-time' || o.format === 'date') delete o.pattern;
    for (const k of Object.keys(o)) o[k] = clean(o[k]);
    return o;
  };
  return Object.fromEntries(Object.entries(out.schemas).map(([k, v]) => [k, clean(v)]));
}

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({ description, content: { 'application/json': { schema: ref(id) } } });
const errors = {
  '401': json('Error', 'Missing, malformed, unknown or revoked key'),
  '403': json('Error', 'Workspace inactive, terms not accepted, or the plan has no API access'),
  '429': {
    ...json('Error', 'Per-minute rate limit or daily quota reached (Retry-After says when to retry)'),
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds' } },
  },
  '503': json('Error', 'The B2B service is switched off'),
};
const pagination = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
  { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
];
const skuId = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

/** The published OpenAPI 3.1 document of `/api/v1/b2b` (deterministic: the committed file is compared with it). */
export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pretoscop B2B price intelligence API',
      version: '1.0.0',
      description:
        'Prices observed by Pretoscop on Romanian online shops, for the SKUs your workspace tracks. Amounts in lei (RON) including VAT, as decimal strings; times in UTC. ' +
        'Every request counts against the daily quota of your plan (Europe/Bucharest days). Data-usage terms: https://pretoscop.ro/pentru-companii/termeni (no resale, no publication, no AI training). ' +
        'No consumer personal data and no Open Icecat content is ever returned.',
    },
    servers: [{ url: '/api/v1/b2b' }],
    security: [{ bearer: [] }],
    paths: {
      '/positions': {
        get: {
          summary: 'Position table: your price against the market, per SKU',
          parameters: [...pagination, { name: 'status', in: 'query', schema: { type: 'string', enum: ['matched', 'unmatched', 'ambiguous'] } }],
          responses: { '200': json('PositionPage', 'Positions in your SKU order'), ...errors },
        },
      },
      '/skus': {
        get: {
          summary: 'Tracked SKUs',
          parameters: [...pagination, { name: 'status', in: 'query', schema: { type: 'string', enum: ['matched', 'unmatched', 'ambiguous'] } }],
          responses: { '200': json('SkuPage', 'SKUs'), ...errors },
        },
        post: {
          summary: 'Add SKUs by GTIN or MPN (resolved against the catalogue; up to your plan’s SKU limit)',
          requestBody: { required: true, content: { 'application/json': { schema: ref('SkuImportRequest') } } },
          responses: { '200': json('SkuImportResult', 'What was added'), '400': json('Error', 'Invalid body'), ...errors },
        },
      },
      '/skus/{id}': {
        get: { summary: 'One SKU with every competitor offer', parameters: [skuId], responses: { '200': json('PositionDetailBody', 'SKU'), '404': json('Error', 'Not a SKU of this workspace'), ...errors } },
        delete: { summary: 'Stop tracking a SKU', parameters: [skuId], responses: { '204': { description: 'Removed' }, '404': json('Error', 'Not a SKU of this workspace'), ...errors } },
      },
      '/skus/{id}/history': {
        get: {
          summary: 'Observed daily price history of the SKU’s product (gaps stay gaps)',
          parameters: [skuId, { name: 'range', in: 'query', schema: { type: 'string', enum: ['30d', '90d', '1y', 'all'], default: '90d' } }],
          responses: { '200': json('History', 'Daily series'), '404': json('Error', 'Not a matched SKU of this workspace'), ...errors },
        },
      },
      '/changes': {
        get: {
          summary: 'Observed price and stock changes on your SKUs (at most 7 days back)',
          parameters: [
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Default: 24 hours ago' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 500 } },
          ],
          responses: { '200': json('ChangePage', 'Changes, newest first'), '400': json('Error', 'Invalid since'), ...errors },
        },
      },
      '/usage': { get: { summary: 'Quota and usage', responses: { '200': json('Usage', 'Usage'), ...errors } } },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'API key `psk_…` created in the workspace' } },
      schemas: components(),
    },
  };
}
