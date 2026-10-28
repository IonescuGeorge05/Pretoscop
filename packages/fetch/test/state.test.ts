import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { KeyedMutex } from '../src/mutex';
import { FileDomainStateStore } from '../src/state/file';
import { MemoryDomainStateStore } from '../src/state/memory';
import type { DomainStateStore, RobotsCacheEntry } from '../src/state/types';

const dir = mkdtempSync(join(tmpdir(), 'pretoscop-fetch-state-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let clockT = 0;
const now = () => clockT;
let fileCounter = 0;
const newFile = () => join(dir, `state-${++fileCounter}.json`);

const stores: Array<[string, () => DomainStateStore]> = [
  ['MemoryDomainStateStore', () => new MemoryDomainStateStore({ now })],
  ['FileDomainStateStore', () => new FileDomainStateStore(newFile(), { now })],
];

describe.each(stores)('%s contract', (_name, make) => {
  let store: DomainStateStore;
  beforeEach(() => {
    clockT = Date.parse('2026-10-28T10:00:00Z');
    store = make();
  });

  it('reserves slots at least one interval apart per host', async () => {
    const a = await store.reserveSlot('shop.ro', 5000);
    const b = await store.reserveSlot('shop.ro', 5000);
    const c = await store.reserveSlot('shop.ro', 5250);
    expect(a).toEqual({ startAt: clockT, waitMs: 0 });
    expect(b).toEqual({ startAt: clockT + 5000, waitMs: 5000 });
    expect(c).toEqual({ startAt: clockT + 10_000, waitMs: 10_000 });
    expect(await store.reserveSlot('other.ro', 5000)).toEqual({ startAt: clockT, waitMs: 0 });
    clockT += 60_000;
    expect((await store.reserveSlot('shop.ro', 5000)).waitMs).toBe(0);
  });

  it('extends automatic pauses but lets manual pauses replace them', async () => {
    const auto = { until: clockT + 3_600_000, reason: 'http_429', setAt: clockT, source: 'auto' as const };
    await store.setPause('shop.ro', auto, 'extend');
    const shorter = await store.setPause('shop.ro', { ...auto, until: clockT + 60_000, reason: 'shorter' }, 'extend');
    expect(shorter.reason).toBe('http_429');
    const longer = await store.setPause('shop.ro', { ...auto, until: clockT + 86_400_000, reason: 'challenge' }, 'extend');
    expect(longer.reason).toBe('challenge');
    const manual = await store.setPause('shop.ro', { ...auto, until: clockT + 60_000, reason: 'manual', source: 'manual' }, 'replace');
    expect(manual.reason).toBe('manual');
    expect((await store.getPause('shop.ro'))?.until).toBe(clockT + 60_000);
    clockT += 60_000;
    expect(await store.getPause('shop.ro')).toBeNull();
    await store.setPause('shop.ro', { ...auto, until: clockT + 1000 }, 'extend');
    await store.clearPause('shop.ro');
    expect(await store.getPause('shop.ro')).toBeNull();
  });

  it('counts consecutive failures', async () => {
    expect(await store.recordFailure('shop.ro')).toBe(1);
    expect(await store.recordFailure('shop.ro')).toBe(2);
    expect(await store.getFailures('shop.ro')).toBe(2);
    await store.resetFailures('shop.ro');
    expect(await store.getFailures('shop.ro')).toBe(0);
    expect(await store.getFailures('never.ro')).toBe(0);
  });

  it('enforces a daily request budget per Bucharest day', async () => {
    expect(await store.consumeDailyRequest('shop.ro', '2026-10-28', 2)).toEqual({ allowed: true, count: 1 });
    expect(await store.consumeDailyRequest('shop.ro', '2026-10-28', 2)).toEqual({ allowed: true, count: 2 });
    expect(await store.consumeDailyRequest('shop.ro', '2026-10-28', 2)).toEqual({ allowed: false, count: 2 });
    expect(await store.getDailyCount('shop.ro', '2026-10-28')).toBe(2);
    expect(await store.consumeDailyRequest('shop.ro', '2026-10-29', 2)).toEqual({ allowed: true, count: 1 });
    expect(await store.consumeDailyRequest('free.ro', '2026-10-28', null)).toEqual({ allowed: true, count: 1 });
  });

  it('stores robots.txt cache entries per origin', async () => {
    const entry: RobotsCacheEntry = {
      origin: 'https://www.shop.ro',
      fetchedAt: clockT,
      expiresAt: clockT + 86_400_000,
      status: 200,
      outcome: 'parsed',
      body: 'User-agent: *\nDisallow: /cart\n',
      etag: '"abc"',
    };
    expect(await store.getRobots('https://www.shop.ro')).toBeNull();
    await store.setRobots('https://www.shop.ro', entry);
    expect(await store.getRobots('https://www.shop.ro')).toEqual(entry);
  });
});

describe('FileDomainStateStore across processes', () => {
  it('never hands out overlapping slots to two stores sharing one file', async () => {
    clockT = Date.parse('2026-10-28T10:00:00Z');
    const file = newFile();
    // Two instances = two independent lock holders, exactly like two CLI processes.
    const a = new FileDomainStateStore(file, { now });
    const b = new FileDomainStateStore(file, { now });
    const reservations = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).reserveSlot('www.dedeman.ro', 5000)),
    );
    const starts = reservations.map((r) => r.startAt).sort((x, y) => x - y);
    for (let i = 1; i < starts.length; i++) expect((starts[i] as number) - (starts[i - 1] as number)).toBe(5000);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it('recovers from a corrupt file and from a lock left by a dead process', async () => {
    const file = newFile();
    writeFileSync(file, '{not json');
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, at: Date.now() }));
    const store = new FileDomainStateStore(file, { now, lockTimeoutMs: 2000 });
    expect((await store.reserveSlot('shop.ro', 5000)).waitMs).toBe(0);
    expect(readdirSync(dir).some((f) => f.startsWith(`${basename(file)}.corrupt-`))).toBe(true);
  });
});

describe('KeyedMutex', () => {
  it('runs holders of one key one at a time, in order, and keys independently', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const task = async (key: string, name: string, ms: number) => {
      const release = await mutex.acquire(key);
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
      release();
    };
    await Promise.all([task('a', 'a1', 20), task('a', 'a2', 1), task('b', 'b1', 1)]);
    expect(order.indexOf('a1:end')).toBeLessThan(order.indexOf('a2:start'));
    expect(order.indexOf('b1:end')).toBeLessThan(order.indexOf('a1:end'));
    expect(mutex.size).toBe(0);
  });

  it('gives up waiting when the signal aborts, without breaking the queue', async () => {
    const mutex = new KeyedMutex();
    const release1 = await mutex.acquire('a');
    const controller = new AbortController();
    const waiting = mutex.acquire('a', controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ fetchCode: 'aborted' });
    release1();
    const release3 = await mutex.acquire('a');
    release3();
  });
});
