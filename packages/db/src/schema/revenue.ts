import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type CommissionStatus = 'pending' | 'accepted' | 'rejected' | 'paid';

/**
 * Affiliate commissions imported from network reports or APIs (M24). `click_id` comes from the
 * sub-id we put on the link (our click's id); there is no foreign key because clicks are
 * aggregated after 90 days. Amounts are what the network reports for us, in RON.
 */
export const commissions = pgTable(
  'commissions',
  {
    id: id(),
    network: text('network').notNull(),
    networkCommissionId: text('network_commission_id').notNull(),
    shopId: bigint('shop_id', { mode: 'number' }).references(() => shops.id),
    programExternalId: text('program_external_id'),
    clickId: bigint('click_id', { mode: 'number' }),
    status: text('status').$type<CommissionStatus>().notNull(),
    amount: money('amount').notNull(),
    saleAmount: money('sale_amount'),
    currency: text('currency').notNull().default('RON'),
    occurredAt: ts('occurred_at').notNull(),
    networkUpdatedAt: ts('network_updated_at'),
    importedAt: ts('imported_at').notNull().defaultNow(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('commissions_network_id_uq').on(t.network, t.networkCommissionId),
    index('commissions_shop_occurred_idx').on(t.shopId, t.occurredAt),
    index('commissions_click_idx').on(t.clickId),
    check('commissions_status_ck', sql`${t.status} in ('pending','accepted','rejected','paid')`),
  ],
);
