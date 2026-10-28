import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commissionsFromCsv, parseCsv } from '../src/affiliate/csv';
import { clickIdFromSub, commissionStatus, moneyToBani, TwoPerformantClient } from '../src/affiliate/twoperformant';

// A local stand-in for api.2performant.com, shaped after doc.2performant.com (no account exists yet).
let server: Server;
let base = '';
const seen: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    seen.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.pathname === '/users/sign_in.json' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-token': 'tok', client: 'cli', uid: 'me@example.com' });
      res.end('{"user":{"id":1}}');
      return;
    }
    if (req.headers['access-token'] !== 'tok' || req.headers.client !== 'cli' || req.headers.uid !== 'me@example.com') {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === '/affiliate/programs.json') {
      const page = Number(url.searchParams.get('page'));
      const programs =
        page === 1
          ? [{ id: 1, name: 'IT Galaxy', main_url: 'https://www.itgalaxy.ro', unique_code: 'u1', affrequest: { status: 'accepted' }, traffic_sources: [{ name: 'Price Comparison Services', usage: 'yes' }] }]
          : [{ id: 2, name: 'Bonami', main_url: 'https://www.bonami.ro', unique_code: 'u2', affrequest: { status: 'pending' }, traffic_sources: [] }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ programs, metadata: { pagination: { current_page: page, pages: 2, results: 2 } } }));
      return;
    }
    if (url.pathname === '/affiliate/commissions.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ commissions: [{ id: 7, status: 'accepted', amount: '30.00', currency: 'RON', created_at: '2026-10-25T10:00:00Z', stats_tags: 'c55', program: { unique_code: 'u1' } }], metadata: { pagination: { pages: 1 } } }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('2Performant client (M24)', () => {
  it('signs in once, sends the token headers and follows pagination', async () => {
    const c = new TwoPerformantClient({ baseUrl: base, email: 'me@example.com', password: 'secret', pauseMs: 0 });
    const programs = await c.programs();
    expect(programs.map((p) => p.unique_code)).toEqual(['u1', 'u2']);
    const commissions = await c.commissions('2026-09-13', '2026-10-28');
    expect(commissions[0]).toMatchObject({ id: 7, status: 'accepted', stats_tags: 'c55' });
    expect(seen.filter((s) => s.startsWith('POST /users/sign_in'))).toHaveLength(1);
    expect(seen.some((s) => s.includes('filter%5Bstart_date%5D=2026-09-13'))).toBe(true);
  });

  it('refuses to continue without the sign-in headers', async () => {
    const c = new TwoPerformantClient({ baseUrl: `${base}/nope`, email: 'x', password: 'y', pauseMs: 0 });
    await expect(c.programs()).rejects.toThrow(/sign-in failed: HTTP 401/);
  });

  it('maps statuses, click ids and amounts', () => {
    expect(['pending', 'Accepted', 'approved', 'canceled', 'paid', '??'].map(commissionStatus)).toEqual(['pending', 'accepted', 'accepted', 'rejected', 'paid', 'pending']);
    expect([clickIdFromSub('c123'), clickIdFromSub('pc-c9'), clickIdFromSub('abc123'), clickIdFromSub(null)]).toEqual([123, 9, null, null]);
    expect([moneyToBani('1.234,56'), moneyToBani('1234.56'), moneyToBani('12,5'), moneyToBani(30), moneyToBani('')]).toEqual([123456, 123456, 1250, 3000, null]);
  });
});

describe('commission CSV import (M24)', () => {
  it('parses quoted, semicolon-separated Romanian exports', () => {
    expect(parseCsv('a;b\r\n"x;1";"he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'he said "hi"'],
    ]);
  });

  it('reconciles the fixture report: per-status counts and totals, click ids, bad lines reported', () => {
    const { rows, errors } = commissionsFromCsv(readFileSync(new URL('./fixtures/2performant-commissions.csv', import.meta.url), 'utf8'));
    expect(errors).toEqual(['line 6: id, amount or date unreadable']);
    const by = (s: string) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.amountBani, 0);
    expect([by('pending'), by('accepted'), by('rejected'), by('paid')]).toEqual([1250, 4500, 810, 123456]);
    expect(rows.map((r) => r.clickId)).toEqual([101, 102, null, 103]);
    expect(rows[2]).toMatchObject({ programExternalId: 'u2', occurredAt: new Date('2026-10-21T12:00:00Z'), saleAmountBani: 16200 });
  });
});
