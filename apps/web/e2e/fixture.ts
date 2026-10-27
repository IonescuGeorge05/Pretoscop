import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The throwaway product of packages/db/src/fixtures/e2e.ts, created in global setup.
export interface E2eFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
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
