import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The throwaway product of packages/db/src/fixtures/e2e.ts, created in global setup.
export interface E2eFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
  admin: { dupA: number; dupB: number; dupBSlug: string; reviewOfferId: number; reviewTitle: string };
  /** Brand Testoscop (M14–M16): an indexable TV (2 offers), a single-offer phone, a console with a verified drop. */
  search: {
    brandSlug: string;
    tv: { id: number; slug: string; title: string };
    phone: { id: number; slug: string; title: string };
    deal: { id: number; slug: string; title: string; dropSince: string };
  };
}

/** Index prefix of the e2e search index (built in global setup from the dev database + fixture). */
export const E2E_SEARCH_PREFIX = 'e2e_';
const WORKER_DIR = fileURLToPath(new URL('../../worker', import.meta.url));

/** Rebuilds or drops the e2e search indexes (worker CLI with MEILI_INDEX_PREFIX=e2e_). */
export function searchCli(cmd: 'rebuild' | 'drop'): void {
  execFileSync('pnpm', ['exec', 'tsx', 'src/cli/search.ts', cmd], { cwd: WORKER_DIR, encoding: 'utf8', env: { ...process.env, MEILI_INDEX_PREFIX: E2E_SEARCH_PREFIX } });
}

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));

export function fixtureCli(cmd: 'create' | 'drop' | 'clicks'): unknown {
  const out = execFileSync('pnpm', ['exec', 'tsx', 'src/cli/e2e-fixture.ts', cmd], { cwd: DB_DIR, encoding: 'utf8' });
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
  if (!line) throw new Error(`e2e fixture ${cmd}: no JSON output\n${out}`);
  return JSON.parse(line);
}

export function fixture(): E2eFixture {
  const raw = process.env.E2E_FIXTURE;
  if (!raw) throw new Error('E2E_FIXTURE missing: global setup did not run');
  return JSON.parse(raw) as E2eFixture;
}
