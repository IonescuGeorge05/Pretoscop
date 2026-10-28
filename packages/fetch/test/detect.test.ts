import { errors as undiciErrors } from 'undici';
import { describe, expect, it } from 'vitest';
import {
  classifyTransportError,
  detectBlock,
  detectChallengeRedirect,
  looksLikeHtml,
  parseRetryAfter,
  type BlockVendor,
} from '../src/detect';
import { FetchError } from '../src/errors';
import type { BlockReason } from '../src/types';
import { readFixture } from './fixtures';

const HTML = 'text/html; charset=utf-8';

interface FixtureCase {
  name: string;
  file: string;
  status: number;
  headers?: Record<string, string>;
  expect: { blocked: false } | { blocked: true; reason: BlockReason; vendor: BlockVendor };
}

const fixtureCases: FixtureCase[] = [
  {
    name: 'Cloudflare managed challenge, 403 + cf-mitigated',
    file: 'cloudflare_challenge_synthetic.html',
    status: 403,
    headers: { 'cf-mitigated': 'challenge', server: 'cloudflare', 'cf-ray': '8f1a2b3c4d5e6f70-OTP' },
    expect: { blocked: true, reason: 'challenge', vendor: 'cloudflare' },
  },
  {
    name: 'Cloudflare challenge served with 503 (markers in the body only)',
    file: 'cloudflare_challenge_synthetic.html',
    status: 503,
    expect: { blocked: true, reason: 'challenge', vendor: 'cloudflare' },
  },
  {
    name: 'Cloudflare challenge served with 200',
    file: 'cloudflare_challenge_synthetic.html',
    status: 200,
    expect: { blocked: true, reason: 'challenge', vendor: 'cloudflare' },
  },
  {
    name: 'Akamai Access Denied 403',
    file: 'akamai_access_denied_403_synthetic.html',
    status: 403,
    headers: { server: 'AkamaiGHost' },
    expect: { blocked: true, reason: 'http_403', vendor: 'akamai' },
  },
  {
    name: 'Akamai Access Denied 403 recognised from the body alone',
    file: 'akamai_access_denied_403_synthetic.html',
    status: 403,
    expect: { blocked: true, reason: 'http_403', vendor: 'akamai' },
  },
  {
    name: 'CloudFront Request blocked 403',
    file: 'cloudfront_request_blocked_403_synthetic.html',
    status: 403,
    headers: { server: 'CloudFront', 'x-cache': 'Error from cloudfront' },
    expect: { blocked: true, reason: 'http_403', vendor: 'cloudfront' },
  },
  {
    name: 'CloudFront Request blocked 403 recognised from the body alone',
    file: 'cloudfront_request_blocked_403_synthetic.html',
    status: 403,
    expect: { blocked: true, reason: 'http_403', vendor: 'cloudfront' },
  },
  {
    name: 'Cloudflare "Sorry, you have been blocked" 403',
    file: 'cloudflare_block_403_synthetic.html',
    status: 403,
    headers: { server: 'cloudflare', 'cf-ray': '8f1a2b3c4d5e6f70-OTP' },
    expect: { blocked: true, reason: 'http_403', vendor: 'cloudflare' },
  },
  {
    name: 'Distinct Captcha page (evoMAG hoster) served with 200',
    file: 'distinct_captcha_synthetic.html',
    status: 200,
    expect: { blocked: true, reason: 'challenge', vendor: 'distinct' },
  },
  {
    name: 'cel.ro "Verificare rapida" bot check with decoy JSON-LD products, served with 200',
    file: 'cel_celcaptcha_decoy_from-research-notes.html',
    status: 200,
    expect: { blocked: true, reason: 'challenge', vendor: 'celcaptcha' },
  },
  {
    name: 'Fastly "Client Challenge" interstitial (Hornbach) served with 200',
    file: 'fastly_client_challenge_200_synthetic.html',
    status: 200,
    headers: { 'x-served-by': 'cache-fra-etou8220000-FRA' },
    expect: { blocked: true, reason: 'challenge', vendor: 'fastly' },
  },
  {
    name: 'Tencent EdgeOne JS challenge (Fashion Days) served with 200',
    file: 'edgeone_challenge_200_synthetic.html',
    status: 200,
    headers: { server: 'TencentEdgeOne' },
    expect: { blocked: true, reason: 'challenge', vendor: 'edgeone' },
  },
  {
    name: 'DataDome CAPTCHA 403',
    file: 'datadome_captcha_403_synthetic.html',
    status: 403,
    headers: { 'x-datadome': 'protected' },
    expect: { blocked: true, reason: 'challenge', vendor: 'datadome' },
  },
  {
    name: 'PerimeterX "Press & Hold" 403',
    file: 'perimeterx_captcha_synthetic.html',
    status: 403,
    expect: { blocked: true, reason: 'challenge', vendor: 'perimeterx' },
  },
  {
    name: 'normal product page with Cloudflare jsd, DataDome and PerimeterX tags is NOT a block',
    file: 'normal_product_page_with_cf_jsd_synthetic.html',
    status: 200,
    headers: { server: 'cloudflare', 'cf-ray': '8f1a2b3c4d5e6f70-OTP', 'x-datadome': 'protected' },
    expect: { blocked: false },
  },
  {
    name: 'plain 503 maintenance page is not a block',
    file: 'maintenance_503_synthetic.html',
    status: 503,
    expect: { blocked: false },
  },
];

describe('detectBlock on fixture pages', () => {
  it.each(fixtureCases)('$name', (c) => {
    const body = readFixture('blocks', c.file);
    const d = detectBlock({ status: c.status, headers: c.headers, contentType: HTML, body, url: 'https://www.shop.example.ro/p/1' });
    if (!c.expect.blocked) {
      expect(d.blocked).toBe(false);
      return;
    }
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe(c.expect.reason);
    expect(d.vendor).toBe(c.expect.vendor);
    expect(d.detail).toBeTruthy();
  });

  it('cel.ro: the bot check is recognised on a large page too, and its words alone in normal text are not', () => {
    const decoy = readFixture('blocks', 'cel_celcaptcha_decoy_from-research-notes.html');
    const padded = decoy.replace('</body>', `<div>` + 'x'.repeat(200_000) + '</div></body>');
    expect(detectBlock({ status: 200, contentType: HTML, body: padded })).toMatchObject({ blocked: true, reason: 'challenge', vendor: 'celcaptcha' });
    const normal =
      '<!doctype html><html><head><title>Placi video - cel.ro</title></head><body>' +
      '<p>Verificare rapida a stocului in magazin.</p><span class="price"><span class="value">1549</span> <span class="currency">lei</span></span>' +
      '<form><div class="g-recaptcha"></div>Confirma ca nu esti un robot pentru newsletter.</form></body></html>';
    expect(detectBlock({ status: 200, contentType: HTML, body: normal + 'x'.repeat(70_000) }).blocked).toBe(false);
  });

  it('gives the Akamai reference in the detail', () => {
    const d = detectBlock({ status: 403, contentType: HTML, body: readFixture('blocks', 'akamai_access_denied_403_synthetic.html') });
    expect(d.detail).toMatch(/Akamai "Access Denied" \(Reference #\)/);
  });
});

describe('false-positive guards', () => {
  it('never scans robots.txt served as text/plain (Decathlon lists /_Incapsula_Resource)', () => {
    const body = readFixture('robots', 'decathlon_style_incapsula_synthetic.txt');
    expect(detectBlock({ status: 200, contentType: 'text/plain', body, purpose: 'robots' }).blocked).toBe(false);
    // Even when mislabelled as HTML, a body without HTML tags is not an HTML document.
    expect(detectBlock({ status: 200, contentType: 'text/html', body, purpose: 'robots' }).blocked).toBe(false);
  });

  it('never scans XML, JSON or CSV bodies', () => {
    const marker = '<loc>https://geo.captcha-delivery.com/captcha</loc> <title>Client Challenge</title>';
    expect(detectBlock({ status: 200, contentType: 'application/xml', body: `<?xml version="1.0"?><urlset>${marker}</urlset>` }).blocked).toBe(false);
    expect(detectBlock({ status: 200, contentType: 'application/json', body: JSON.stringify({ marker }) }).blocked).toBe(false);
    expect(detectBlock({ status: 200, contentType: 'text/csv', body: `id,title\n1,"${marker}"` }).blocked).toBe(false);
  });

  it('counts weak markers only on interstitial-sized pages', () => {
    const script = '<script src="/_Incapsula_Resource?SWJIYLWA=719d34d31c8e3a6e6fffd425f7e032f3"></script>';
    const small = `<html><head><meta name="robots" content="noindex">${script}</head><body></body></html>`;
    expect(detectBlock({ status: 200, contentType: HTML, body: small })).toMatchObject({ blocked: true, reason: 'challenge', vendor: 'imperva' });
    const normal = readFixture('blocks', 'normal_product_page_with_cf_jsd_synthetic.html');
    const large = normal.replace('</head>', `${script}</head>`).replace('</main>', `${'<p>Specificații tehnice detaliate. </p>'.repeat(2500)}</main>`);
    expect(large.length).toBeGreaterThan(64 * 1024);
    expect(detectBlock({ status: 200, contentType: HTML, body: large }).blocked).toBe(false);
  });

  it('treats the jsd path alone as normal, the orchestrate path as a challenge', () => {
    const jsd = '<html><head><title>Produs</title></head><body><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>';
    expect(detectBlock({ status: 200, contentType: HTML, body: jsd }).blocked).toBe(false);
    const orchestrate = '<html><head><title>Produs</title></head><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=1"></script></body></html>';
    expect(detectBlock({ status: 200, contentType: HTML, body: orchestrate }).reason).toBe('challenge');
  });

  it('does not flag ordinary 404/500 pages', () => {
    const page = '<!doctype html><html><head><title>Pagina nu a fost găsită</title></head><body>404</body></html>';
    expect(detectBlock({ status: 404, contentType: HTML, body: page }).blocked).toBe(false);
    expect(detectBlock({ status: 500, contentType: HTML, body: page }).blocked).toBe(false);
  });

  it('recognises HTML documents by content, not by the header alone', () => {
    expect(looksLikeHtml('text/html', 'User-agent: *\nDisallow: /x')).toBe(false);
    expect(looksLikeHtml(null, '  <!DOCTYPE html><html></html>')).toBe(true);
    expect(looksLikeHtml('application/xhtml+xml', '<html xmlns="http://www.w3.org/1999/xhtml"></html>')).toBe(true);
    expect(looksLikeHtml('text/plain', '<html></html>')).toBe(false);
  });
});

describe('status rules', () => {
  it('429 is http_429 with Retry-After', () => {
    const d = detectBlock({ status: 429, headers: { 'retry-after': '120' }, contentType: 'text/plain', body: 'slow down' });
    expect(d).toMatchObject({ blocked: true, reason: 'http_429', retryAfterMs: 120_000 });
  });

  it('511 (eMAG-style bot throttling) is treated like 429', () => {
    expect(detectBlock({ status: 511 })).toMatchObject({ blocked: true, reason: 'http_429' });
  });

  it('a plain 403 without vendor marks is still a block', () => {
    expect(detectBlock({ status: 403, contentType: 'text/plain', body: 'Forbidden' })).toMatchObject({
      blocked: true,
      reason: 'http_403',
      vendor: 'unknown',
    });
  });

  it('503 without challenge markers is not a block but carries Retry-After', () => {
    const d = detectBlock({ status: 503, headers: { 'retry-after': '7200' }, contentType: HTML, body: readFixture('blocks', 'maintenance_503_synthetic.html') });
    expect(d).toEqual({ blocked: false, retryAfterMs: 7_200_000 });
  });

  it('parses Retry-After as seconds or HTTP-date', () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    expect(parseRetryAfter('3600', now)).toBe(3_600_000);
    expect(parseRetryAfter('Wed, 28 Oct 2026 12:00:00 GMT', now)).toBe(2 * 3_600_000);
    expect(parseRetryAfter('Wed, 28 Oct 2026 09:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });
});

describe('redirects to CAPTCHA hosts', () => {
  const from = new URL('https://www.evomag.example/robots.txt');

  it('flags the Distinct captcha redirect (never followed)', () => {
    const d = detectBlock({
      status: 302,
      headers: { location: 'http://captcha.distinct.ro/?original_url=https://www.evomag.example/robots.txt' },
      url: from.href,
    });
    expect(d).toMatchObject({ blocked: true, reason: 'captcha_redirect', vendor: 'distinct' });
  });

  it('flags DataDome, Cloudflare and generic captcha hosts and challenge paths', () => {
    expect(detectChallengeRedirect(from, new URL('https://geo.captcha-delivery.com/captcha/?initialCid=x'))?.vendor).toBe('datadome');
    expect(detectChallengeRedirect(from, new URL('https://challenges.cloudflare.com/x'))?.vendor).toBe('cloudflare');
    expect(detectChallengeRedirect(from, new URL('https://captcha.hoster.example/'))).not.toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.evomag.example/.well-known/sgcaptcha/?r=%2F'))).not.toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.evomag.example/_fs-ch-abc/'))?.vendor).toBe('fastly');
  });

  it('does not flag ordinary redirects', () => {
    expect(detectChallengeRedirect(from, new URL('https://evomag.example/robots.txt'))).toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.evomag.example/laptopuri/'))).toBeNull();
    expect(detectBlock({ status: 301, headers: { location: '/laptopuri/' }, url: from.href }).blocked).toBe(false);
  });

  it("flags a CAPTCHA subdomain of the shop's own site (same site, different host)", () => {
    const shopPage = new URL('https://www.shop.example.ro/p/1');
    expect(detectChallengeRedirect(shopPage, new URL('https://captcha.shop.example.ro/?r=%2Fp%2F1'))).not.toBeNull();
    expect(detectChallengeRedirect(shopPage, new URL('https://challenge.shop.example.ro/'))).not.toBeNull();
    expect(detectChallengeRedirect(shopPage, new URL('https://m.shop.example.ro/p/1'))).toBeNull();
  });

  it('does not flag a shop whose own name contains "challenge", nor "captcha" in a query string', () => {
    const shop = new URL('https://challenge-sport.example/robots.txt');
    expect(detectChallengeRedirect(shop, new URL('https://www.challenge-sport.example/robots.txt'))).toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.challenge-sport.example/'))).toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.evomag.example/login?next=%2F&recaptcha=1'))).toBeNull();
    expect(detectChallengeRedirect(from, new URL('https://www.evomag.example/recaptcha/verify'))).not.toBeNull();
  });
});

describe('transport errors', () => {
  const cases: Array<{ name: string; error: unknown; code: string; block: boolean; transient?: boolean }> = [
    { name: 'socket closed by the edge (undici)', error: new undiciErrors.SocketError('other side closed'), code: 'connection_reset', block: true },
    { name: 'TCP reset', error: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), code: 'connection_reset', block: true },
    {
      name: 'HTTP/2 stream reset (Akamai)',
      error: Object.assign(new Error('Stream closed with error code NGHTTP2_INTERNAL_ERROR'), { code: 'ERR_HTTP2_STREAM_ERROR' }),
      code: 'http2_reset',
      block: true,
    },
    { name: 'HTTP/2 GOAWAY', error: new undiciErrors.SocketError('HTTP/2: "GOAWAY" frame received with code 2'), code: 'http2_reset', block: true },
    { name: 'connect timeout (cel.ro from abroad)', error: new undiciErrors.ConnectTimeoutError(), code: 'connect_timeout', block: true },
    {
      name: 'TLS failure',
      error: Object.assign(new Error('SSL routines:ssl3_get_record:wrong version number'), { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }),
      code: 'tls_error',
      block: true,
    },
    {
      name: 'reset wrapped in a cause chain',
      error: new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }),
      code: 'connection_reset',
      block: true,
    },
    {
      name: 'expired certificate is a shop configuration problem, not a block',
      error: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }),
      code: 'tls_certificate',
      block: false,
      transient: false,
    },
    { name: 'DNS failure', error: Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }), code: 'dns', block: false, transient: false },
    { name: 'connection refused', error: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), code: 'connection_refused', block: false, transient: true },
    { name: 'local network down', error: Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' }), code: 'network_unreachable', block: false, transient: true },
    { name: 'headers timeout', error: new undiciErrors.HeadersTimeoutError(), code: 'timeout', block: false, transient: true },
    { name: 'our overall timeout', error: new FetchError('timeout', 'no complete response within 30000 ms'), code: 'timeout', block: false, transient: true },
    { name: 'size cap', error: new FetchError('body_too_large', 'too big'), code: 'body_too_large', block: false, transient: false },
    {
      name: 'a request we could not build (bad header value) is our fault, not a shop failure',
      error: new undiciErrors.InvalidArgumentError('invalid if-none-match header'),
      code: 'invalid_request',
      block: false,
      transient: false,
    },
  ];

  it.each(cases)('$name', (c) => {
    const cls = classifyTransportError(c.error);
    expect(cls.code).toBe(c.code);
    expect(cls.block).toBe(c.block);
    if (c.transient !== undefined) expect(cls.transient).toBe(c.transient);
    const d = detectBlock({ error: c.error });
    expect(d.blocked).toBe(c.block);
    if (c.block) expect(d.reason).toBe('transport');
  });
});
