import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The throwaway product of packages/db/src/fixtures/e2e.ts, created in global setup.
export interface E2eFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
  admin: {
    dupA: number;
    dupB: number;
    dupBSlug: string;
    reviewOfferId: number;
    reviewTitle: string;
  };
  /** Brand Testoscop (M14–M16): an indexable TV (2 offers), a single-offer phone, a console with a verified drop. */
  search: {
    brandSlug: string;
    tv: { id: number; slug: string; title: string };
    phone: { id: number; slug: string; title: string };
    deal: { id: number; slug: string; title: string; dropSince: string };
    /** A subcategory with no active product (see packages/db/src/fixtures/e2e.ts); null when none is left. */
    emptyCategory: { path: string; name: string } | null;
  };
}

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));
const WORKER_DIR = fileURLToPath(new URL('../../worker', import.meta.url));
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));

/** This checkout's MEILI_INDEX_PREFIX, read like the apps read it: the environment first, then `.env`. */
function checkoutIndexPrefix(): string {
  const fromEnv = process.env.MEILI_INDEX_PREFIX;
  if (fromEnv !== undefined) return fromEnv.trim();
  try {
    const line = /^MEILI_INDEX_PREFIX=(.*)$/m.exec(readFileSync(ROOT_ENV, 'utf8'));
    return line ? line[1]!.trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  } catch {
    return '';
  }
}

/**
 * Index prefix of the e2e search indexes (built in global setup from the dev database + fixture):
 * the checkout's own prefix followed by `e2e_`, so parallel checkouts sharing one Meilisearch never
 * read or drop each other's indexes, and the dev indexes are never touched.
 */
export const E2E_SEARCH_PREFIX = `${checkoutIndexPrefix()}e2e_`;

/**
 * Runs one of the monorepo's TypeScript CLIs in `cwd` and returns its stdout. Node loads it with tsx
 * directly rather than through `pnpm exec`: on Windows pnpm is a .cmd shim, which child_process
 * cannot start without a shell.
 */
export function runTsx(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}

/**
 * Builds the data-driven sitemaps (worker `sitemap:build`, M16) for the site at `baseUrl`, from the
 * dev database with the fixture in it; returns the CLI's JSON summary.
 */
export function sitemapBuild(baseUrl: string): { baseUrl: string; files: Array<{ name: string; urls: number }> } {
  const out = runTsx(WORKER_DIR, ['src/cli/sitemap-build.ts'], { ...process.env, PUBLIC_BASE_URL: baseUrl });
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{'));
  if (!line) throw new Error(`sitemap:build: no JSON output\n${out}`);
  return JSON.parse(line) as { baseUrl: string; files: Array<{ name: string; urls: number }> };
}

/** Rebuilds or drops the e2e search indexes (worker search CLI with MEILI_INDEX_PREFIX=E2E_SEARCH_PREFIX). */
export function searchCli(cmd: 'rebuild' | 'drop'): void {
  runTsx(WORKER_DIR, ['src/cli/search.ts', cmd], { ...process.env, MEILI_INDEX_PREFIX: E2E_SEARCH_PREFIX });
}

type FixtureCommand =
  | 'create'
  | 'drop'
  | 'clicks'
  | 'affiliate-allow'
  | 'affiliate-sync-forbidden'
  | 'affiliate-restore';

export function fixtureCli(cmd: FixtureCommand, ...args: string[]): unknown {
  const out = runTsx(DB_DIR, ['src/cli/e2e-fixture.ts', cmd, ...args]);
  const line = out
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e fixture ${cmd}: no JSON output\n${out}`);
  return JSON.parse(line);
}

export function fixture(): E2eFixture {
  const raw = process.env.E2E_FIXTURE;
  if (!raw) throw new Error('E2E_FIXTURE missing: global setup did not run');
  return JSON.parse(raw) as E2eFixture;
}

/** REVALIDATE_TOKEN from the repo's .env (as the web server under test reads it), else the dev default. */
export function revalidateToken(): string {
  try {
    const env = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
    return (
      /^REVALIDATE_TOKEN=(.+)$/m.exec(env)?.[1]?.trim() || 'dev-only-insecure-secret-change-me'
    );
  } catch {
    return 'dev-only-insecure-secret-change-me';
  }
}
