import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildExtension, manifestFor, originOnly } from '../build';
import { SHOPS } from '../src/shops';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as Record<string, unknown> & {
  content_scripts: Array<{ matches: string[]; js: string[]; all_frames: boolean }>;
  background: Record<string, unknown>;
};
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('manifest (MV3)', () => {
  it('runs the content script on the five shops, top frame only, and the shops agree with src/shops.ts', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]!.matches).toEqual(SHOPS.flatMap((s) => [...s.matches]));
    expect(manifest.content_scripts[0]!.all_frames).toBe(false);
  });

  it('asks for no permission at all: no host permissions, storage, tabs, web-accessible resources or external messaging', () => {
    for (const key of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions', 'web_accessible_resources', 'externally_connectable', 'content_security_policy']) {
      expect(manifest).not.toHaveProperty(key);
    }
  });

  it('one manifest for Chrome (service_worker) and Firefox (scripts)', () => {
    expect(manifest.background).toEqual({ service_worker: 'background.js', scripts: ['background.js'] });
    expect(manifestFor('chrome')).toMatchObject({ version: pkg.version, minimum_chrome_version: '121' });
    expect(manifestFor('chrome')).not.toHaveProperty('browser_specific_settings');
    const ff = manifestFor('firefox');
    expect(ff).not.toHaveProperty('minimum_chrome_version');
    expect(ff.browser_specific_settings).toEqual({
      gecko: { id: 'extensie@pretoscop.ro', strict_min_version: '140.0', data_collection_permissions: { required: ['browsingActivity', 'websiteContent'] } },
    });
  });

  it('takes origins only for the API and the site', () => {
    expect(originOnly('http://localhost:3490', 'api')).toBe('http://localhost:3490');
    expect(() => originOnly('https://pretoscop.ro/api', 'api')).toThrow();
    expect(() => originOnly('javascript:alert(1)', 'api')).toThrow();
    expect(() => originOnly('https://u:p@pretoscop.ro', 'api')).toThrow();
  });
});

describe('build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pretoscop-ext-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each(['chrome', 'firefox'] as const)('%s: two readable bundles, the manifest and the icons; no HTML parsing or eval', async (target) => {
    const out = join(dir, target);
    const r = await buildExtension({ target, outDir: out, apiBase: 'http://localhost:3490', siteBase: 'http://localhost:3490' });
    expect(Object.keys(r.files).sort()).toEqual(['background.js', 'content.js', 'icons/icon-128.png', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'manifest.json']);
    const bg = readFileSync(join(out, 'background.js'), 'utf8');
    const content = readFileSync(join(out, 'content.js'), 'utf8');
    expect(bg).toContain('"http://localhost:3490"');
    expect(bg).not.toContain('__PRETOSCOP_API_BASE__');
    for (const code of [bg, content]) {
      expect(code).not.toMatch(/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
      // Nothing that could send data elsewhere: one fetch (the lookup), no beacons, sockets or storage.
      expect(code).not.toMatch(/sendBeacon|WebSocket|XMLHttpRequest|chrome\.storage|localStorage|indexedDB/);
    }
    expect(content).not.toMatch(/\bfetch\(/);
    // The global fetch is called once (the lookup); `opts.fetch(` is the service calling it.
    expect((bg.match(/(?<![.\w])fetch\(/g) ?? []).length).toBe(1);
    expect(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))).toEqual(manifestFor(target));
  });
});
