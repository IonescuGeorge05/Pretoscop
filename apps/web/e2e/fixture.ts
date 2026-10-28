import { execFileSync } from 'node:child_process';
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
}

const DB_DIR = fileURLToPath(new URL('../../../packages/db', import.meta.url));

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

export function fixtureCli(cmd: 'create' | 'drop' | 'clicks'): unknown {
  const out = runTsx(DB_DIR, ['src/cli/e2e-fixture.ts', cmd]);
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
