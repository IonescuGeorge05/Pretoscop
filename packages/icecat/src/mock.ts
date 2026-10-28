/**
 * A local stand-in for the Open Icecat Live JSON API and its image host, serving the synthetic
 * fixtures in `packages/icecat/fixtures/` (no account exists yet, and nothing in this build calls
 * Icecat live). Used by the tests, `make verify M=11` and `icecat:lookup --mock`.
 *
 * `GET /robots.txt`, `GET /api?lang=RO&shopname=…&GTIN=…` or `&Brand=…&ProductCode=…`,
 * `GET /img/gallery/<name>.jpg` (a generated JPEG, a different colour per name). Image URLs in the
 * fixtures (`https://images.icecat.biz/…`) are rewritten to the mock's own origin.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';

const FIXTURES = new URL('../fixtures/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

const PRODUCTS: Record<string, string> = {
  dell: 'product-dell-g5-5587_ro_synthetic.json',
  samsung: 'product-samsung-galaxy-s23_ro_synthetic.json',
  philips: 'product-philips-hd9252-90_ro_synthetic.json',
};
const BY_GTIN: Record<string, keyof typeof PRODUCTS> = {
  '5397184119709': 'dell',
  '05397184119709': 'dell',
  '8806094724721': 'samsung',
  '08806094724721': 'samsung',
};
const BY_CODE: Record<string, keyof typeof PRODUCTS> = {
  'dell|5587-synth-01': 'dell',
  'samsung|sm-s911bzkdeue': 'samsung',
  'philips|hd9252/90': 'philips',
};
/** Brands that answer 403 (Full Icecat only) or 404 with brand restrictions (research, 2026-10-27). */
const FULL_ONLY = new Set(['sony', 'xiaomi', 'logitech', 'amd']);
const RESTRICTED = new Set(['apple']);
/** GTIN prefixes answered like Apple's (brand restrictions). */
const RESTRICTED_GTIN = /^0?19425[0-9]/;

export interface IcecatMockRequest {
  path: string;
  query: Record<string, string>;
  userAgent: string | undefined;
}

export interface IcecatMockOptions {
  /** robots.txt body; default allows everything. */
  robotsTxt?: string;
  /** Overrides the answer for a request (tests: 429, 500, …); return undefined for the default. */
  respond?: (
    req: IcecatMockRequest,
  ) => { status: number; body: string; headers?: Record<string, string> } | undefined;
}

export interface IcecatMock {
  origin: string;
  /** Base URL for `createIcecatClient({ baseUrl })`. */
  apiUrl: string;
  requests: IcecatMockRequest[];
  close(): Promise<void>;
}

const errors = JSON.parse(fixture('errors_synthetic.json')) as Record<
  'notFound' | 'brandRestricted' | 'fullIcecatOnly',
  unknown
>;

function colourOf(name: string): { r: number; g: number; b: number } {
  const h = createHash('sha256').update(name).digest();
  return { r: h[0] ?? 0, g: h[1] ?? 0, b: h[2] ?? 0 };
}

export async function startIcecatMock(options: IcecatMockOptions = {}): Promise<IcecatMock> {
  const requests: IcecatMockRequest[] = [];
  const images = new Map<string, Buffer>();
  let origin = '';

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://mock');
      const query = Object.fromEntries(url.searchParams.entries());
      const entry: IcecatMockRequest = {
        path: url.pathname,
        query,
        userAgent: req.headers['user-agent'],
      };
      requests.push(entry);
      const custom = options.respond?.(entry);
      if (custom) {
        res.writeHead(custom.status, {
          'content-type': 'application/json; charset=utf-8',
          ...(custom.headers ?? {}),
        });
        res.end(custom.body);
        return;
      }
      if (url.pathname === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(options.robotsTxt ?? 'User-agent: *\nAllow: /\n');
        return;
      }
      if (url.pathname === '/api') {
        if (!query.shopname)
          return json(res, 400, { COMMENT: 'shopname is required', StatusCode: 2 });
        const brand = (query.Brand ?? '').toLowerCase();
        const code = (query.ProductCode ?? '').toLowerCase();
        if (FULL_ONLY.has(brand)) return json(res, 403, errors.fullIcecatOnly);
        if (RESTRICTED.has(brand) || (query.GTIN && RESTRICTED_GTIN.test(query.GTIN)))
          return json(res, 404, errors.brandRestricted);
        const key = query.GTIN ? BY_GTIN[query.GTIN] : BY_CODE[`${brand}|${code}`];
        if (!key) return json(res, 404, errors.notFound);
        const body = fixture(PRODUCTS[key]!).replaceAll('https://images.icecat.biz', origin);
        return json(res, 200, body);
      }
      if (url.pathname.startsWith('/img/')) {
        let img = images.get(url.pathname);
        if (!img) {
          img = await sharp({
            create: { width: 1200, height: 1200, channels: 3, background: colourOf(url.pathname) },
          })
            .jpeg({ quality: 80 })
            .toBuffer();
          images.set(url.pathname, img);
        }
        res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(img.length) });
        res.end(img);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    })().catch((err: unknown) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    apiUrl: `${origin}/api`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
