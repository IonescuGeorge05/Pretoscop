import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment contract for every process (web, worker, scripts, tests).
 * Every variable is documented in `.env.example`; keep the two in sync.
 */

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const int = (def: number) => z.coerce.number().int().default(def);
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

/** `203.0.113.10`, `2001:db8::1`, or a CIDR prefix such as `203.0.113.0/28` or `2001:db8::/64`. */
export function isIpOrCidr(value: string): boolean {
  const [addr, prefix, ...rest] = value.split('/');
  if (rest.length > 0 || !addr) return false;
  const family = isIP(addr);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

/** Comma-separated IP addresses / CIDR prefixes; every entry must be valid. */
const ipList = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .superRefine((items, ctx) => {
    for (const item of items) {
      if (!isIpOrCidr(item)) {
        ctx.addIssue({ code: 'custom', message: `"${item}" is not an IPv4/IPv6 address or CIDR prefix` });
      }
    }
  });

export const EnvSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'test', 'staging', 'prod']).default('dev'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: bool.default(false),

    // Database
    DATABASE_URL: z.string().min(1).default('postgres://pretoscop:pretoscop@localhost:5432/pretoscop'),
    DATABASE_POOL_MAX: int(10),
    TEST_DATABASE_ADMIN_URL: z
      .string()
      .min(1)
      .default('postgres://pretoscop:pretoscop@localhost:5432/postgres'),

    // Public site
    PUBLIC_BASE_URL: z.string().min(1).default('http://localhost:3000'),
    // Where the worker reaches the web app for cache revalidation (defaults to PUBLIC_BASE_URL).
    WEB_INTERNAL_URL: optionalString,
    SITE_INDEXABLE: bool.default(false),

    // Search
    MEILI_URL: z.string().min(1).default('http://localhost:7700'),
    MEILI_MASTER_KEY: z.string().min(1).default('dev-master-key-change-me-0123456789'),

    // Crawler identity and politeness (CLAUDE.md non-negotiable rules)
    BOT_INFO_URL: z.string().min(1).default('https://pretoscop.ro/bot'),
    /** Fixed crawler egress IPs published on /bot and /bot/ips.json (empty until setup A4). */
    BOT_EGRESS_IPS: ipList,
    CRAWL_ENABLED: bool.default(false),
    FETCH_DEFAULT_MIN_INTERVAL_MS: int(5000),
    FETCH_TIMEOUT_MS: int(30000),
    FETCH_MAX_BODY_BYTES: int(15 * 1024 * 1024),
    /** Lets the worker's fetcher reach private/loopback addresses (local fixture servers). Never in production. */
    FETCH_ALLOW_PRIVATE_HOSTS: bool.default(false),

    // Assisted-access channel (M05B, ADR-015)
    ASSISTED_VENDOR: z.enum(['none', 'zyte', 'oxylabs']).default('none'),
    ZYTE_API_KEY: optionalString,
    OXYLABS_USERNAME: optionalString,
    OXYLABS_PASSWORD: optionalString,
    ASSISTED_MONTHLY_CAP_EUR: z.coerce.number().default(150),

    // Blob storage (R2 in production, local filesystem in dev)
    BLOB_DRIVER: z.enum(['fs', 's3']).default('fs'),
    BLOB_FS_ROOT: z.string().default('./data/blobs'),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,

    // Email
    MAIL_DRIVER: z.enum(['smtp', 'resend', 'log']).default('smtp'),
    SMTP_URL: z.string().default('smtp://localhost:1025'),
    RESEND_API_KEY: optionalString,
    MAIL_FROM: z.string().default('Pretoscop <noreply@pretoscop.ro>'),
    MAIL_REPLY_TO: z.string().default('contact@pretoscop.ro'),
    COMPANY_LEGAL_NAME: z.string().default('Pretoscop (în curs de înființare)'),
    COMPANY_POSTAL_ADDRESS: z.string().default('România'),

    // Auth, admin, web internals
    BETTER_AUTH_SECRET: z.string().min(16).default(DEV_SECRET),
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    REVALIDATE_TOKEN: z.string().min(16).default(DEV_SECRET),
    HASH_SALT_SECRET: z.string().min(16).default(DEV_SECRET),

    // Price alerts (M19): signs confirmation/unsubscribe links and keys the stable address hash
    // (suppression list, consent ledger). Never rotate without accepting that both break.
    ALERTS_SECRET: z.string().min(16).default(DEV_SECRET),
    // Resend webhook signing secret (`whsec_…`) for bounces and complaints; unset = endpoint off.
    RESEND_WEBHOOK_SECRET: optionalString,

    // Operations alerts (two consecutive source failures, backups, caps)
    OPS_ALERT_TELEGRAM_BOT_TOKEN: optionalString,
    OPS_ALERT_TELEGRAM_CHAT_ID: optionalString,
    OPS_ALERT_EMAIL: optionalString,

    // LLM (M22, ADR-011)
    ANTHROPIC_API_KEY: optionalString,
    LLM_MONTHLY_CAP_EUR: z.coerce.number().default(50),
    LLM_MODEL_DEFAULT: z.string().default('claude-haiku-5-5'),
    LLM_MODEL_ESCALATION: z.string().default('claude-sonnet-5-5'),

    // Icecat (M11). Open Icecat needs only the account name (sent as `shopname`); the tokens are
    // for Full Icecat and are not used. The job also needs the flag `icecat.enabled` (off).
    ICECAT_USERNAME: optionalString,
    ICECAT_API_TOKEN: optionalString,
    ICECAT_CONTENT_TOKEN: optionalString,
    ICECAT_BASE_URL: z.string().min(1).default('https://live.icecat.biz/api'),
    // Languages tried in order: the first one is stored; the next only when the first has no content.
    ICECAT_LANGS: z.string().min(2).default('RO,EN'),
    // Datasheet requests per language and month (Open Icecat Fair Use Policy: 1,000,000).
    ICECAT_MONTHLY_CAP: int(1_000_000),
    // Products looked up per icecat.sync run (new ones first, then 30-day refreshes).
    ICECAT_DAILY_BATCH: int(2000),
    // Minimum interval between two requests to an Icecat host (Icecat allows up to 100 per second).
    ICECAT_MIN_INTERVAL_MS: int(1000),

    // Affiliate networks (M24)
    TWOPERFORMANT_EMAIL: optionalString,
    TWOPERFORMANT_PASSWORD: optionalString,
    /** Our affiliate code (aff_code in quicklinks). */
    TWOPERFORMANT_UNIQUE_CODE: optionalString,
    TWOPERFORMANT_API_URL: z.string().min(1).default('https://api.2performant.com'),
    PROFITSHARE_API_USER: optionalString,
    PROFITSHARE_API_KEY: optionalString,
    AWIN_PUBLISHER_ID: optionalString,
    CJ_PUBLISHER_ID: optionalString,
    TRADEDOUBLER_AFFILIATE_ID: optionalString,

    // Analytics and monitoring
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: optionalString,
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: optionalString,
    NEXT_PUBLIC_MEDIA_BASE_URL: optionalString,
    SENTRY_DSN: optionalString,
    METRICS_PORT: int(9464),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'staging' || env.APP_ENV === 'prod') {
      for (const key of ['BETTER_AUTH_SECRET', 'REVALIDATE_TOKEN', 'HASH_SALT_SECRET', 'ALERTS_SECRET'] as const) {
        if (env[key] === DEV_SECRET) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} must be set outside dev` });
        }
      }
      if (env.FETCH_ALLOW_PRIVATE_HOSTS) {
        ctx.addIssue({ code: 'custom', path: ['FETCH_ALLOW_PRIVATE_HOSTS'], message: 'FETCH_ALLOW_PRIVATE_HOSTS is for local development only' });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Walks up from `start` to the directory holding `pnpm-workspace.yaml`. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(/*turbopackIgnore: true*/ start);
  for (;;) {
    if (existsSync(join(/*turbopackIgnore: true*/ dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(/*turbopackIgnore: true*/ start);
    dir = parent;
  }
}

/** Loads the repository-root `.env` into `process.env` without overriding variables already set. */
export function loadRootEnvFile(start?: string): void {
  const file = join(/*turbopackIgnore: true*/ findRepoRoot(start), '.env');
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch {
    // A malformed .env must not crash tooling; validation below reports missing values.
  }
}

/** Parses and caches the environment. Throws with a readable message on invalid values. */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** For tests: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Resolves a path relative to the repository root (used for BLOB_FS_ROOT and similar). */
export function repoPath(...parts: string[]): string {
  return join(/*turbopackIgnore: true*/ findRepoRoot(), ...parts);
}
