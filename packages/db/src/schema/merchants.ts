import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export type MerchantStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type MerchantFeedFormat = 'google' | 'compari' | 'csv';
export type MerchantPriceFormat = 'decimal' | 'ro';
export type DomainVerificationMethod = 'email' | 'dns' | 'file' | 'admin';

/** Delivery rules the merchant declares for its shop (lei, VAT included), copied to `shops.shipping_rules` on approval. */
export interface MerchantShippingRules {
  free_over?: number | null;
  flat?: number | null;
  locker_flat?: number | null;
  notes?: string;
}

/** One normalized offer of the feed preview (amounts in bani). */
export interface MerchantPreviewRow {
  externalId: string;
  title: string;
  url: string;
  priceBani: number | null;
  oldPriceBani: number | null;
  shippingBani: number | null;
  totalBani: number | null;
  shippingBasis: string | null;
  availability: string | null;
  condition: string | null;
  gtin: string | null;
  brand: string | null;
  /** Why this offer would not be listed (empty when it would). */
  rejects: string[];
  warnings: string[];
}

/** What the feed check found (worker `merchant.validate`); the web turns it into Romanian hints. */
export interface MerchantFeedReport {
  source: 'url' | 'upload';
  fetchedAt: string;
  bytes: number;
  /** Format used for parsing (the merchant's choice, else the detected one). */
  format: MerchantFeedFormat;
  /** What the first bytes looked like (null: unrecognized). */
  detectedFormat: MerchantFeedFormat | null;
  parserKey: string;
  offers: number;
  rows: number;
  skippedRows: number;
  truncated: boolean;
  fields: Record<string, number>;
  priceFormat: { verdict: string; ambiguousExamples: string[]; effective: MerchantPriceFormat | null; needsChoice: boolean };
  vat: { included: number; excluded: number; unknown: number };
  currencies: Record<string, number>;
  domain: { expected: string | null; onDomain: number; offDomain: number; offDomainExamples: string[] };
  duplicateIds: number;
  parseError: string | null;
  normalization: {
    accepted: number;
    rejected: number;
    rejectReasons: Record<string, number>;
    warnings: Record<string, number>;
    shippingBasis: Record<string, number>;
  };
  preview: MerchantPreviewRow[];
}

/** The feed (and shop domain) a check was made for: a result only counts while they are unchanged. */
export interface MerchantFeedTarget {
  feedUrl: string | null;
  feedUploadKey: string | null;
  domain: string | null;
}

/** Result of the last feed check (worker job `merchant.feed_check`), shown to the merchant and the admin. */
export interface MerchantValidation {
  status: 'queued' | 'running' | 'done' | 'failed';
  requestedAt: string;
  /** What was checked (set by the worker; absent on rows written before it existed). */
  target?: MerchantFeedTarget;
  finishedAt?: string;
  /** Why the check could not run, in Romanian for the merchant (fetch refused, robots.txt, HTTP error, unknown format). */
  error?: string;
  /** Technical detail for the admin. */
  detail?: string;
  report?: MerchantFeedReport;
}

/** Result of the last domain check (DNS TXT record or file), worker job `merchant.domain_check`. */
export interface MerchantDomainCheck {
  status: 'queued' | 'running' | 'done';
  requestedAt: string;
  finishedAt?: string;
  /** The domain that was checked (a result for another domain is never shown or applied). */
  domain?: string;
  dns?: 'found' | 'missing' | 'error';
  /** `skipped`: the domain belongs to a shop we already crawl; only DNS or email prove it. */
  file?: 'found' | 'missing' | 'blocked' | 'error' | 'skipped';
  detail?: string;
}

/**
 * A shop that lists itself through the merchant portal (M20, free listing). One profile per user
 * account. Lifecycle: draft (onboarding) → pending (submitted) → approved (feed source created and
 * pulled 6×/day) | rejected; approved → suspended (offers hidden at once) → approved. Rejections and suspensions carry a
 * statement of reasons (P2B Regulation 2019/1150 art. 4). A merchant may only list offers whose
 * product URLs are on the domain it proved it controls (`domain_verified_at`).
 */
export const merchants = pgTable(
  'merchants',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Set on approval: the shop the merchant's feed belongs to (created or existing). */
    shopId: bigint('shop_id', { mode: 'number' }).references(() => shops.id),
    status: text('status').$type<MerchantStatus>().notNull().default('draft'),
    /** Shop name as buyers know it ("Magazinul Meu"), shown on product pages. */
    shopName: text('shop_name'),
    /** Legal entity ("SC Magazinul Meu SRL"). */
    companyName: text('company_name'),
    /** Romanian fiscal code, digits only (the RO prefix is not stored). */
    cui: text('cui'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone'),
    websiteUrl: text('website_url'),
    /** Registrable domain of the shop, lower case (`magazinulmeu.ro`). */
    domain: text('domain'),
    verificationToken: text('verification_token').notNull(),
    verificationMethod: text('verification_method').$type<DomainVerificationMethod>(),
    domainVerifiedAt: ts('domain_verified_at'),
    domainCheck: jsonb('domain_check').$type<MerchantDomainCheck>(),
    /** Feed address (https URL), or null when the merchant uploaded a file. */
    feedUrl: text('feed_url'),
    /** Blob-store key of an uploaded feed file (`merchant-feeds/{id}/{time}.{ext}`). */
    feedUploadKey: text('feed_upload_key'),
    feedUploadedAt: ts('feed_uploaded_at'),
    feedFormat: text('feed_format').$type<MerchantFeedFormat>(),
    /** How to read "12.500" in this feed: `decimal` = 12.5, `ro` = 12500 (null: unambiguous). */
    priceFormat: text('price_format').$type<MerchantPriceFormat>(),
    shippingRules: jsonb('shipping_rules').$type<MerchantShippingRules>().notNull().default({}),
    validation: jsonb('validation').$type<MerchantValidation>(),
    termsVersion: text('terms_version'),
    termsAcceptedAt: ts('terms_accepted_at'),
    /** Commercial plan (M25); everything is free today. */
    plan: text('plan').notNull().default('free'),
    /** Statement of reasons of the last rejection or suspension (P2B art. 4), shown to the merchant. */
    statusReason: text('status_reason'),
    decidedAt: ts('decided_at'),
    decidedBy: text('decided_by'),
    submittedAt: ts('submitted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('merchants_user_uq').on(t.userId),
    index('merchants_status_idx').on(t.status, t.submittedAt),
    // One approved listing per domain: a second registrant must contact us.
    uniqueIndex('merchants_domain_approved_uq').on(t.domain).where(sql`${t.status} = 'approved'`),
    check('merchants_status_ck', sql`${t.status} in ('draft','pending','approved','rejected','suspended')`),
    check('merchants_feed_format_ck', sql`${t.feedFormat} is null or ${t.feedFormat} in ('google','compari','csv')`),
    check('merchants_price_format_ck', sql`${t.priceFormat} is null or ${t.priceFormat} in ('decimal','ro')`),
    check(
      'merchants_verification_method_ck',
      sql`${t.verificationMethod} is null or ${t.verificationMethod} in ('email','dns','file','admin')`,
    ),
  ],
);
