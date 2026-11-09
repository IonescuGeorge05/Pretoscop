import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadShops, parseShopYaml, SHOPS_DIR } from '@pretoscop/config/shops';
import { addProbeToYaml, classifyFetch, probeTargets, summarizeProbe } from '../src/registry/probe';

const ok = { url: 'https://www.magazin.ro/', status: 200, ok: true, blocked: false, contentType: 'text/html; charset=utf-8', bytes: 153_600 };

describe('probe classification', () => {
  it('maps fetch outcomes to the registry vocabulary', () => {
    expect(classifyFetch(ok)).toBe('served');
    expect(classifyFetch({ ...ok, status: 403, ok: false, blocked: true, blockReason: 'http_403' })).toBe('blocked');
    expect(classifyFetch({ ...ok, status: 302, ok: false, blocked: true, blockReason: 'captcha_redirect' })).toBe('challenge');
    expect(classifyFetch({ ...ok, status: 200, ok: false, blocked: true, blockReason: 'challenge' })).toBe('challenge');
    expect(classifyFetch({ ...ok, status: 0, ok: false, skipped: 'robots_disallowed' })).toBe('robots_disallow');
    expect(classifyFetch({ ...ok, status: 0, ok: false, errorCode: 'timeout' })).toBe('timeout');
    expect(classifyFetch({ ...ok, status: 0, ok: false, skipped: 'access_off', errorCode: 'robots_unavailable' })).toBe('error');
    expect(classifyFetch({ ...ok, status: 500, ok: false })).toBe('error');
  });

  it('keeps the worst outcome and notes every request', () => {
    const s = summarizeProbe([ok, { ...ok, url: 'https://www.magazin.ro/telefoane?p=2', status: 403, ok: false, blocked: true, blockReason: 'http_403' }]);
    expect(s).toEqual({ result: 'blocked', note: '/ 200 (text/html, 150 KB); /telefoane?p=2 403 http_403' });
    expect(summarizeProbe([ok]).result).toBe('served');
  });
});

describe('probe targets and registry entry', () => {
  it('probes the home page and one public page, never the internal search', () => {
    const evomag = loadShops().find((s) => s.slug === 'evomag')!;
    const targets = probeTargets(evomag);
    expect(targets[0]).toEqual({ url: 'https://www.evomag.ro', purpose: 'probe' });
    expect(targets.every((t) => !t.url.includes('sn.q'))).toBe(true);
    expect(probeTargets(evomag, 'https://www.evomag.ro/telefoane/')).toEqual([
      { url: 'https://www.evomag.ro', purpose: 'probe' },
      { url: 'https://www.evomag.ro/telefoane/', purpose: 'probe' },
    ]);
  });

  it('adds the entry at the top of probes: and keeps the file loadable', () => {
    const text = readFileSync(join(SHOPS_DIR, 'evomag.yaml'), 'utf8');
    const before = parseShopYaml(text, 'evomag.yaml').probes.length;
    const entry = { date: '2026-10-28', vantage: 'Hetzner FSN1, "production" IP', result: 'challenge' as const, note: '/robots.txt 302 captcha_redirect' };
    const updated = parseShopYaml(addProbeToYaml(text, entry, 'evomag.yaml'), 'evomag.yaml');
    expect(updated.probes).toHaveLength(before + 1);
    expect(updated.probes[0]).toEqual(entry);
    const noProbes = text.replace(/^probes:[\s\S]*?(?=^notes:)/m, '');
    expect(parseShopYaml(addProbeToYaml(noProbes, entry, 'evomag.yaml'), 'evomag.yaml').probes).toEqual([entry]);
  });
});
