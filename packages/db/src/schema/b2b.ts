import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { brands, products } from './catalog';
import { merchants } from './merchants';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type B2bWorkspaceKind = 'merchant' | 'brand';
export type B2bWorkspaceStatus = 'active' | 'suspended' | 'cancelled';
export type B2bPlanDb = 'pilot' | 'starter' | 'pro' | 'enterprise';
export type B2bMemberRole = 'owner' | 'member';
export type B2bSkuStatus = 'matched' | 'unmatched' | 'ambiguous';
export type B2bMatchMethod = 'gtin' | 'brand_mpn' | 'mpn' | 'catalogue';
export type B2bBillingStatus = 'none' | 'checkout' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';

/**
 * A B2B customer (M28): a merchant (its own shop's offers are "our price") or a brand (its
 * reference prices are). Tenancy boundary: every B2B row hangs off a workspace and every query
 * names it. Never deleted (invoices reference it): cancelled instead.
 */
export const b2bWorkspaces = pgTable(
  'b2b_workspaces',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind').$type<B2bWorkspaceKind>().notNull(),
    /** Merchant workspaces: the shop whose live offers are the customer's own prices. */
    shopId: bigint('shop_id', { mode: 'number' }).references(() => shops.id),
    /** Brand workspaces: the brand (informational; the SKU list decides what is tracked). */
    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id),
    /** The merchant-portal profile this customer came from (M20), when there is one. */
    merchantId: bigint('merchant_id', { mode: 'number' }).references(() => merchants.id, { onDelete: 'set null' }),
    plan: text('plan').$type<B2bPlanDb>().notNull().default('pilot'),
    status: text('status').$type<B2bWorkspaceStatus>().notNull().default('active'),
    /** Admin overrides of the plan's limits (null: the plan's). */
    skuLimit: integer('sku_limit'),
    apiDailyQuota: integer('api_daily_quota'),
    /** Buyer data for invoices (e-Factura needs the CUI and the address). */
    companyName: text('company_name'),
    cui: text('cui'),
    regCom: text('reg_com'),
    billingAddress: text('billing_address'),
    billingEmail: text('billing_email'),
    /** Data-usage terms (no resale): `b2bTerms.v1@<page version>`, who accepted and when. */
    termsVersion: text('terms_version'),
    termsAcceptedAt: ts('terms_accepted_at'),
    termsAcceptedBy: text('terms_accepted_by'),
    /** Subscription with the payment provider (null provider: pilot or contract billing). */
    billingProvider: text('billing_provider'),
    billingCustomerId: text('billing_customer_id'),
    billingSubscriptionId: text('billing_subscription_id'),
    billingStatus: text('billing_status').$type<B2bBillingStatus>().notNull().default('none'),
    billingPeriodEnd: ts('billing_period_end'),
    statusReason: text('status_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('b2b_workspaces_shop_idx').on(t.shopId),
    uniqueIndex('b2b_workspaces_subscription_uq').on(t.billingProvider, t.billingSubscriptionId),
    check('b2b_workspaces_kind_ck', sql`${t.kind} in ('merchant','brand')`),
    check('b2b_workspaces_plan_ck', sql`${t.plan} in ('pilot','starter','pro','enterprise')`),
    check('b2b_workspaces_status_ck', sql`${t.status} in ('active','suspended','cancelled')`),
    check('b2b_workspaces_limits_ck', sql`(${t.skuLimit} is null or ${t.skuLimit} >= 0) and (${t.apiDailyQuota} is null or ${t.apiDailyQuota} >= 0)`),
    check(
      'b2b_workspaces_billing_status_ck',
      sql`${t.billingStatus} in ('none','checkout','active','past_due','canceled','unpaid','incomplete')`,
    ),
  ],
);

/** Who may open a workspace. `digest`: this member gets the daily email. */
export const b2bMembers = pgTable(
  'b2b_members',
  {
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<B2bMemberRole>().notNull().default('member'),
    digest: boolean('digest').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('b2b_members_user_idx').on(t.userId),
    check('b2b_members_role_ck', sql`${t.role} in ('owner','member')`),
  ],
);

/** An invitation by email address, accepted when that address signs in (magic link proves it). */
export const b2bInvites = pgTable(
  'b2b_invites',
  {
    id: id(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    /** Lower case. */
    email: text('email').notNull(),
    role: text('role').$type<B2bMemberRole>().notNull().default('member'),
    invitedBy: text('invited_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    acceptedAt: ts('accepted_at'),
  },
  (t) => [
    uniqueIndex('b2b_invites_open_uq').on(t.workspaceId, t.email).where(sql`${t.acceptedAt} is null`),
    index('b2b_invites_email_idx').on(t.email),
    check('b2b_invites_role_ck', sql`${t.role} in ('owner','member')`),
  ],
);

/**
 * One tracked SKU: what the customer gave (GTIN, MPN, brand, own code, own/recommended price) and
 * the catalogue product it resolved to. `identity` (product, else GTIN, else brand+MPN) is unique
 * per workspace, so a line imported twice is one SKU.
 */
export const b2bSkus = pgTable(
  'b2b_skus',
  {
    id: id(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    identity: text('identity').notNull(),
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id, { onDelete: 'set null' }),
    status: text('status').$type<B2bSkuStatus>().notNull().default('unmatched'),
    matchMethod: text('match_method').$type<B2bMatchMethod>(),
    ref: text('ref'),
    label: text('label'),
    gtin14: text('gtin14'),
    mpnRaw: text('mpn_raw'),
    mpnNorm: text('mpn_norm'),
    brandRaw: text('brand_raw'),
    referencePrice: money('reference_price'),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('b2b_skus_identity_uq').on(t.workspaceId, t.identity),
    uniqueIndex('b2b_skus_product_uq').on(t.workspaceId, t.productId).where(sql`${t.productId} is not null`),
    index('b2b_skus_status_idx').on(t.workspaceId, t.status),
    index('b2b_skus_product_idx').on(t.productId),
    check('b2b_skus_status_ck', sql`${t.status} in ('matched','unmatched','ambiguous')`),
    check('b2b_skus_matched_ck', sql`(${t.status} = 'matched') = (${t.productId} is not null)`),
    check('b2b_skus_method_ck', sql`${t.matchMethod} is null or ${t.matchMethod} in ('gtin','brand_mpn','mpn','catalogue')`),
  ],
);

/** API keys: only the SHA-256 of the secret is kept; `public_id` finds the row. */
export const b2bApiKeys = pgTable(
  'b2b_api_keys',
  {
    id: id(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    publicId: text('public_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    name: text('name').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (t) => [uniqueIndex('b2b_api_keys_public_uq').on(t.publicId), index('b2b_api_keys_workspace_idx').on(t.workspaceId)],
);

/** API requests per workspace and Europe/Bucharest day: the daily quota counter (atomic upsert). */
export const b2bApiUsage = pgTable(
  'b2b_api_usage',
  {
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    requests: integer('requests').notNull().default(0),
    /** Requests refused because the quota was used up. */
    refused: integer('refused').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day] })],
);

/** One daily digest per workspace, day and member: claimed before sending (idempotent job). */
export const b2bDigests = pgTable(
  'b2b_digests',
  {
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('sending'),
    changes: integer('changes').notNull().default(0),
    claimedAt: ts('claimed_at').notNull().defaultNow(),
    sentAt: ts('sent_at'),
    error: text('error'),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.userId] }), check('b2b_digests_status_ck', sql`${t.status} in ('sending','sent','failed')`)],
);

/**
 * Billing documents (M28): one per paid subscription period, with the buyer data an e-Factura
 * invoice needs. The fiscal invoice is issued from these rows by the accountant's tool
 * (`fiscal_number` filled then); kept 10 years (Law 82/1991), so workspaces are never deleted.
 */
export const b2bInvoices = pgTable(
  'b2b_invoices',
  {
    id: id(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => b2bWorkspaces.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerInvoiceId: text('provider_invoice_id').notNull(),
    plan: text('plan').$type<B2bPlanDb>().notNull(),
    periodStart: date('period_start', { mode: 'string' }),
    periodEnd: date('period_end', { mode: 'string' }),
    currency: text('currency').notNull(),
    netAmount: money('net_amount').notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
    vatAmount: money('vat_amount').notNull(),
    totalAmount: money('total_amount').notNull(),
    buyerName: text('buyer_name'),
    buyerCui: text('buyer_cui'),
    buyerRegCom: text('buyer_reg_com'),
    buyerAddress: text('buyer_address'),
    buyerEmail: text('buyer_email'),
    status: text('status').notNull().default('paid'),
    paidAt: ts('paid_at'),
    /** Number of the fiscal invoice once issued (e-Factura); null = still to issue. */
    fiscalNumber: text('fiscal_number'),
    efacturaStatus: text('efactura_status').notNull().default('to_issue'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('b2b_invoices_provider_uq').on(t.provider, t.providerInvoiceId),
    index('b2b_invoices_workspace_idx').on(t.workspaceId, t.createdAt),
    check('b2b_invoices_status_ck', sql`${t.status} in ('paid','refunded','void')`),
    check('b2b_invoices_efactura_ck', sql`${t.efacturaStatus} in ('to_issue','issued','sent','accepted','rejected')`),
  ],
);

/** Payment-provider webhook events already handled (deduplication; providers retry). */
export const b2bBillingEvents = pgTable(
  'b2b_billing_events',
  {
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

/**
 * The only catalogue columns B2B code may read (Icecat exclusion at query level, ADR-016/026):
 * no specs, images, attributes or image pointers, and nothing from consumers. B2B queries join
 * this view, never `products`, `product_specs` or `product_images`.
 */
export const b2bProducts = pgView('b2b_products', {
  id: bigint('id', { mode: 'number' }).notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  titleAscii: text('title_ascii').notNull(),
  status: text('status').notNull(),
  mergedIntoId: bigint('merged_into_id', { mode: 'number' }),
  mpn: text('mpn'),
  mpnNorm: text('mpn_norm'),
  brandId: bigint('brand_id', { mode: 'number' }),
  brand: text('brand'),
  category: text('category'),
}).as(sql`
  SELECT p.id, p.slug, p.title, p.title_ascii, p.status, p.merged_into_id, p.mpn, p.mpn_norm, p.brand_id, b.name AS brand, c.name_ro AS category
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id`);
