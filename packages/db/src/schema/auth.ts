import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Better Auth tables (magic link only, ADR-009). Property names are Better Auth's field names;
 * columns are snake_case. Sessions never store a raw IP or User-Agent (hooks in apps/web).
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export type UserRole = 'user' | 'admin' | 'merchant';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: text('role').$type<UserRole>().notNull().default('user'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    /**
     * M19 retention: the last sign of life (login, alert created, confirmed or edited, "keep my
     * account"). Accounts inactive for 24 months get a notice, then are deleted 30 days later.
     */
    lastActiveAt: ts('last_active_at').notNull().defaultNow(),
    retentionNoticeAt: ts('retention_notice_at'),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), check('users_role_ck', sql`${t.role} in ('user','admin','merchant')`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.token), index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
