import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * Builds the extension with esbuild (M26; WXT was planned, see ADR-023): one bundle per entry,
 * not minified (store reviewers read it as written), and the manifest per browser:
 *
 * - `dist/chrome`: the manifest as written (MV3; `background` carries both `service_worker`, used
 *   by Chrome, and `scripts`, used by Firefox);
 * - `dist/firefox`: the same plus `browser_specific_settings.gecko` (add-on id, minimum version,
 *   data-collection declaration), which Chrome would flag as an unknown key.
 *
 * Usage: tsx build.ts [--target=chrome|firefox|all] [--out=DIR] [--api=ORIGIN] [--site=ORIGIN]
 * (defaults: all, dist/<target>, https://pretoscop.ro for both). The e2e test builds one pointed
 * at its local server.
 */

export type Target = 'chrome' | 'firefox';

export interface BuildOptions {
  target: Target;
  outDir?: string;
  /** Origin of the lookup API. */
  apiBase?: string;
  /** Origin of the product pages the panel links to. */
  siteBase?: string;
}

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ORIGIN = 'https://pretoscop.ro';
export const FIREFOX_ADDON_ID = 'extensie@pretoscop.ro';

/** An http(s) origin and nothing else (no path, query, credentials). */
export function originOnly(raw: string, what: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${what}: not a URL: ${raw}`);
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw new Error(`${what}: expected an http(s) origin such as https://pretoscop.ro, got ${raw}`);
  }
  return u.origin;
}

export function manifestFor(target: Target): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  manifest.version = pkg.version;
  if (target === 'firefox') {
    // Chrome-only key (Firefox would list it as unknown).
    delete manifest.minimum_chrome_version;
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: '140.0',
        // Firefox's built-in data-consent declaration: the address of the product page and
        // identifiers read from its content are sent to Pretoscop (nothing else).
        data_collection_permissions: { required: ['browsingActivity', 'websiteContent'] },
      },
    };
  }
  return manifest;
}

export async function buildExtension(o: BuildOptions): Promise<{ outDir: string; files: Record<string, number> }> {
  const apiBase = originOnly(o.apiBase ?? DEFAULT_ORIGIN, 'api');
  const siteBase = originOnly(o.siteBase ?? DEFAULT_ORIGIN, 'site');
  const outDir = resolve(o.outDir ?? join(ROOT, 'dist', o.target));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: { background: join(ROOT, 'src/background.ts'), content: join(ROOT, 'src/content.ts') },
    outdir: outDir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome121', 'firefox128'],
    minify: false,
    legalComments: 'none',
    logLevel: 'silent',
    define: {
      __PRETOSCOP_API_BASE__: JSON.stringify(apiBase),
      __PRETOSCOP_SITE_BASE__: JSON.stringify(siteBase),
    },
  });
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifestFor(o.target), null, 2)}\n`);
  cpSync(join(ROOT, 'icons'), join(outDir, 'icons'), { recursive: true });
  const files: Record<string, number> = {};
  const walk = (dir: string, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, `${prefix}${name}/`);
      else files[`${prefix}${name}`] = statSync(p).size;
    }
  };
  walk(outDir);
  return { outDir, files };
}

async function main(): Promise<void> {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const which = arg('target') ?? 'all';
  const targets: Target[] = which === 'all' ? ['chrome', 'firefox'] : which === 'chrome' || which === 'firefox' ? [which] : [];
  if (targets.length === 0) throw new Error(`--target must be chrome, firefox or all, got ${which}`);
  if (arg('out') && targets.length > 1) throw new Error('--out needs a single --target');
  for (const target of targets) {
    const r = await buildExtension({ target, outDir: arg('out'), apiBase: arg('api'), siteBase: arg('site') });
    const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
    console.log(`${target}: ${r.outDir} (background.js ${kb(r.files['background.js'] ?? 0)}, content.js ${kb(r.files['content.js'] ?? 0)})`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
