/**
 * Records one page as an extractor fixture through the polite fetcher (M10):
 *
 *   pnpm --filter @pretoscop/fetch record <shop> <name> <url> [--ext html] [--purpose product]
 *
 * → packages/extractors/fixtures/<shop>/<name>_<YYYY-MM-DD>.<ext> plus `<file>.meta.json`
 *   (docs/05 A.5: fixtures are real recorded pages with the recording date in the file name;
 *   never edit them by hand, re-record them).
 *
 * Everything the crawler obeys applies: PretoscopBot identity, robots.txt (fetched and obeyed
 * first), the shop's registry interval (≥ 5 s, Crawl-delay when longer) shared with the demo CLI
 * through `<repo>/data/fetch-demo-state.json`, block detection and pauses. Shops whose registry
 * status is not `active` or whose access mode is not `direct` are refused before any request
 * (blocked shops join through feeds, merchant onboarding, allowlisting or the assisted channel:
 * docs/12). A blocked or challenged response writes nothing and exits 2: record the shop as
 * blocked in its YAML `probes` and stop asking it.
 *
 * Options:
 *   --ext <ext>           file extension (default html; xml, txt, json, csv)
 *   --purpose <p>         robots | sitemap | listing | product | probe (default: robots for
 *                         /robots.txt, sitemap for *.xml, else product)
 *   --out-dir <dir>       write somewhere else (e.g. a scratch directory for a probe)
 *   --max-bytes <n>       body cap (default 15 MiB, the crawler's default)
 *   --state <file>        another state file
 * Exit codes: 0 saved, 2 blocked, 3 skipped (robots, paused, ...), 4 error, 64 usage.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { findRepoRoot, loadRootEnvFile } from '@pretoscop/config/env';
import { getDomainPolicy, loadShops, shopForHost } from '@pretoscop/config/shops';
import { createFetcher } from '../fetcher';
import { buildUserAgent, resolveBotInfoUrl } from '../identity';
import { FileDomainStateStore } from '../state/file';
import type { FetchPurpose, RequestLogEntry } from '../types';

const PURPOSES: FetchPurpose[] = ['robots', 'sitemap', 'listing', 'product', 'probe'];

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    'usage: pnpm --filter @pretoscop/fetch record <shop> <name> <url> [--ext html] [--purpose product] [--out-dir dir] [--max-bytes n] [--state file]',
  );
  process.exit(64);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ext: { type: 'string' },
      purpose: { type: 'string' },
      'out-dir': { type: 'string' },
      'max-bytes': { type: 'string' },
      state: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) usage();
  const [shopSlug, name, raw] = positionals;
  if (!shopSlug || !name || !raw) usage('expected <shop> <name> <url>');
  if (!/^[a-z0-9-]+$/.test(shopSlug)) usage(`invalid shop slug "${shopSlug}"`);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name))
    usage(`invalid fixture name "${name}" (lower-case, digits, . _ -)`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    usage(`not an absolute URL: ${raw}`);
  }
  const ext =
    values.ext ??
    (url.pathname.endsWith('.txt') ? 'txt' : url.pathname.endsWith('.xml') ? 'xml' : 'html');
  if (!/^[a-z0-9]{2,5}$/.test(ext)) usage(`invalid extension "${ext}"`);
  const purpose = (values.purpose ??
    (url.pathname === '/robots.txt'
      ? 'robots'
      : /\.xml(\.gz)?$/.test(url.pathname)
        ? 'sitemap'
        : 'product')) as FetchPurpose;
  if (!PURPOSES.includes(purpose)) usage(`unknown purpose "${purpose}"`);
  if (purpose === 'robots' && url.pathname !== '/robots.txt')
    usage("purpose 'robots' is only for /robots.txt URLs");
  const maxBytes = values['max-bytes'] ? Number(values['max-bytes']) : undefined;
  if (maxBytes !== undefined && !(Number.isInteger(maxBytes) && maxBytes > 0))
    usage('--max-bytes must be a positive integer');

  loadRootEnvFile();
  const root = findRepoRoot();
  const shops = loadShops();
  const shop = shopForHost(shops, url.hostname);
  if (!shop) usage(`${url.hostname} belongs to no shop in packages/config/shops/`);
  if (shop.slug !== shopSlug)
    usage(`${url.hostname} belongs to shop "${shop.slug}", not "${shopSlug}"`);
  if (shop.status !== 'active' || shop.access_mode !== 'direct') {
    console.error(
      `refused: ${shop.slug} has status "${shop.status}" and access mode "${shop.access_mode}" in the registry. ` +
        'Blocked shops join through feeds, merchant onboarding, allowlisting or the assisted channel (docs/12); no request made.',
    );
    process.exit(3);
  }

  const entries: RequestLogEntry[] = [];
  const statePath = values.state ?? join(root, 'data', 'fetch-demo-state.json');
  const fetcher = createFetcher({
    stateStore: new FileDomainStateStore(statePath),
    requestLog: { write: (e) => void entries.push(e) },
    // Started by hand for one page: the worker's CRAWL_ENABLED switch does not apply; every
    // other rule does, with the shop's own registry policy.
    crawlEnabled: true,
    policyFor: (host) => getDomainPolicy(host, shops),
  });

  let exitCode = 0;
  try {
    const res = await fetcher.fetchPolite(url.href, { purpose, shopSlug: shop.slug, maxBytes });
    for (const e of entries.filter((x) => x.attempt > 0)) {
      console.log(
        `${e.ts.toISOString()}  GET ${e.url}  ${e.status || '---'}  ${e.durationMs} ms  waited ${(e.waitMs / 1000).toFixed(1)} s  [${e.purpose}${e.blocked ? `, BLOCKED ${e.blockReason}` : ''}${e.robotsGroup ? `, robots group ${e.robotsGroup}` : ''}]`,
      );
    }
    if (res.blocked) {
      console.error(
        `BLOCKED: ${res.blockReason} ${res.blockDetail ?? ''} — nothing saved; record the shop as blocked and stop.`,
      );
      exitCode = 2;
    } else if (res.skipped) {
      console.error(
        `skipped: ${res.skipped}${res.error ? ` (${res.error})` : ''} — nothing saved.`,
      );
      exitCode = 3;
    } else if (!res.status || res.bodyBytes === null) {
      console.error(
        `no body: status ${res.status} ${res.errorCode ?? ''} ${res.error ?? ''}`.trim(),
      );
      exitCode = 4;
    } else {
      const day = new Date().toISOString().slice(0, 10);
      const dir = values['out-dir'] ?? join(root, 'packages', 'extractors', 'fixtures', shop.slug);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name}_${day}.${ext}`);
      writeFileSync(file, res.bodyBytes);
      const robots = await fetcher.robotsFor(url.origin);
      const meta = {
        url: url.href,
        final_url: res.finalUrl,
        status: res.status,
        recorded_at: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
        user_agent: buildUserAgent('page', resolveBotInfoUrl(process.env.BOT_INFO_URL)),
        content_type: res.contentType,
        bytes: res.bodyBytes.length,
        recorded_with:
          '@pretoscop/fetch record (robots.txt obeyed, per-host interval, block detection)',
        robots_group: robots.matchedGroup,
      };
      writeFileSync(`${file}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
      console.log(
        `saved ${relative(root, file)} (${res.status}, ${res.bodyBytes.length} bytes${res.finalUrl !== url.href ? `, final ${res.finalUrl}` : ''})`,
      );
      if (res.status >= 400) exitCode = 4;
    }
  } finally {
    await fetcher.close();
  }
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(4);
});
