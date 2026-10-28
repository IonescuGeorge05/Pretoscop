import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { request } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyTransportError, createGuardedDispatcher, isNonPublicAddress, NonPublicAddressError, publicOnlyLookup } from '../src/index';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '[::1]',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '188.94.252.10', '2a01:4f8::1', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(false);
  });
});

describe('createGuardedDispatcher', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('feed'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('refuses IP literals and names that resolve to loopback', async () => {
    const guarded = createGuardedDispatcher();
    await expect(request(`http://127.0.0.1:${port}/`, { dispatcher: guarded })).rejects.toThrow(/not a public internet address/);
    await expect(request(`http://localhost:${port}/`, { dispatcher: guarded })).rejects.toThrow(/not a public internet address/);
    await guarded.close();
  });

  it('lets local fixture servers through when explicitly allowed (development, e2e)', async () => {
    const open = createGuardedDispatcher({ allowPrivate: true });
    const res = await request(`http://127.0.0.1:${port}/`, { dispatcher: open });
    expect(await res.body.text()).toBe('feed');
    await open.close();
  });

  it('allowTargets opens exactly one ip:port (an e2e fixture server) and keeps the guard on for the rest', async () => {
    const other = http.createServer((_req, res) => res.end('internal'));
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const otherPort = (other.address() as AddressInfo).port;
    const narrow = createGuardedDispatcher({ allowTargets: [`127.0.0.1:${port}`] });
    try {
      const res = await request(`http://127.0.0.1:${port}/`, { dispatcher: narrow });
      expect(await res.body.text()).toBe('feed');
      await expect(request(`http://127.0.0.1:${otherPort}/`, { dispatcher: narrow })).rejects.toThrow(/not a public internet address/);
      await expect(request(`http://localhost:${port}/`, { dispatcher: narrow })).rejects.toThrow(/not a public internet address/);
    } finally {
      await narrow.close();
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });

  it('a refusal by the guard is classified as our own non-retried refusal, not a shop failure or block', () => {
    const cls = classifyTransportError(new NonPublicAddressError('10.0.0.5'));
    expect(cls).toMatchObject({ code: 'non_public_address', block: false, transient: false, countsAsFailure: false });
  });

  it('publicOnlyLookup fails for a loopback name and answers both lookup shapes for public ones', async () => {
    const one = await new Promise<{ err: Error | null }>((resolve) => publicOnlyLookup('localhost', {}, (err) => resolve({ err })));
    expect(one.err?.message).toMatch(/not a public internet address/);
  });
});
