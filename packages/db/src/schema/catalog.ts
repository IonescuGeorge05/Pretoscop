import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const brands = pgTable(
  'brands',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brands_slug_uq').on(t.slug)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    parentId: bigint('parent_id', { mode: 'number' }).references((): AnyPgColumn => categories.id),
    slug: text('slug').notNull(),
    nameRo: text('name_ro').notNull(),
    nameEn: text('name_en'),
    googleTaxonomyId: integer('google_taxonomy_id'),
    depth: smallint('depth').notNull().default(0),
    /** Materialized slug path, e.g. `electronice/telefoane/smartphone`. */
    path: text('path').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_path_uq').on(t.path), index('categories_parent_idx').on(t.parentId)],
);

export const productFamilies = pgTable(
  'product_families',
  {
    id: id(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('product_families_slug_uq').on(t.slug)],
);

export type ProductStatus = 'active' | 'merged' | 'hidden';
export type ProductOrigin = 'feed' | 'crawl' | 'icecat' | 'manual' | 'matcher';

/** Canonical product = the sellable variant a GTIN identifies (ADR-012). */
export const products = pgTable(
  'products',
  {
    id: id(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    titleAscii: text('title_ascii').notNull(),
    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id),
    familyId: bigint('family_id', { mode: 'number' }).references(() => productFamilies.id),
    mpn: text('mpn'),
    mpnNorm: text('mpn_norm'),
    mpnSource: text('mpn_source'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    primaryImageId: bigint('primary_image_id', { mode: 'number' }),
    status: text('status').$type<ProductStatus>().notNull().default('active'),
    /** Created by the matcher from a single offer: noindex until ≥2 offers, Icecat specs or human check. */
    provisional: boolean('provisional').notNull().default(false),
    mergedIntoId: bigint('merged_into_id', { mode: 'number' }).references((): AnyPgColumn => products.id),
    offerCount: integer('offer_count').notNull().default(0),
    minPrice: money('min_price'),
    minTotalPrice: money('min_total_price'),
    minShopId: bigint('min_shop_id', { mode: 'number' }).references(() => shops.id),
    popularity: real('popularity').notNull().default(0),
    createdBy: text('created_by').$type<ProductOrigin>().notNull().default('matcher'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('products_slug_uq').on(t.slug),
    index('products_brand_idx').on(t.brandId),
    index('products_category_idx').on(t.categoryId),
    index('products_family_idx').on(t.familyId),
    index('products_mpn_norm_idx').on(t.mpnNorm),
    index('products_title_trgm_idx').using('gin', sql`${t.titleAscii} gin_trgm_ops`),
    check('products_status_ck', sql`${t.status} in ('active','merged','hidden')`),
  ],
);

export const productGtins = pgTable(
  'product_gtins',
  {
    /** 14-digit, zero-padded, check digit validated. */
    gtin14: text('gtin14').primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    confidence: real('confidence').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('product_gtins_product_idx').on(t.productId),
    check('product_gtins_len_ck', sql`length(${t.gtin14}) = 14`),
  ],
);

export type ImageSource = 'feed' | 'icecat' | 'manual' | 'merchant';

/** Only licensed sources (ADR-008): affiliate/merchant feeds, Open Icecat, manual uploads. */
export const productImages = pgTable(
  'product_images',
  {
    id: id(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    source: text('source').$type<ImageSource>().notNull(),
    sourceUrl: text('source_url'),
    licenseNote: text('license_note').notNull(),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('product_images_product_idx').on(t.productId),
    check('product_images_source_ck', sql`${t.source} in ('feed','icecat','manual','merchant')`),
  ],
);

/** Icecat data stays here and in product_images; never exported to B2B or used for AI training. */
export const productSpecs = pgTable(
  'product_specs',
  {
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    locale: text('locale').notNull().default('ro'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    attribution: text('attribution'),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.source, t.locale] })],
);
