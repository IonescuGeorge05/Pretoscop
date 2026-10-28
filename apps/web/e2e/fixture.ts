import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The throwaway product of packages/db/src/fixtures/e2e.ts, created in global setup.
export interface E2eFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
  admin: { dupA: number; dupB: number; dupBSlug: string; reviewOfferId: number; reviewTitle: string };
}

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));

type FixtureCommand = 'create' | 'drop' | 'clicks' | 'affiliate-allow' | 'affiliate-sync-forbidden' | 'affiliate-restore';

export function fixtureCli(cmd: FixtureCommand, ...args: string[]): unknown {
  const out = execFileSync('pnpm', ['exec', 'tsx', 'src/cli/e2e-fixture.ts', cmd, ...args], { cwd: DB_DIR, encoding: 'utf8' });
  const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
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
    return /^REVALIDATE_TOKEN=(.+)$/m.exec(env)?.[1]?.trim() || 'dev-only-insecure-secret-change-me';
  } catch {
    return 'dev-only-insecure-secret-change-me';
  }
}
