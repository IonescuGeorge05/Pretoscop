import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// M18: the load balancer's readiness check turns 503 once deploy.sh marks a replica as draining.
describe('/api/ready', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pretoscop-ready-'));
  const drainFile = join(dir, 'draining');
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers 200 until the drain file exists, then 503', async () => {
    vi.stubEnv('DRAIN_FILE', drainFile);
    vi.stubEnv('APP_VERSION', 'v-test');
    vi.resetModules();
    const { GET } = await import('../../app/api/ready/route');

    const ready = GET();
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', version: 'v-test' });
    expect(ready.headers.get('cache-control')).toBe('no-store');

    writeFileSync(drainFile, '');
    const draining = GET();
    expect(draining.status).toBe(503);
    expect(await draining.json()).toEqual({ status: 'draining', version: 'v-test' });
  });
});
