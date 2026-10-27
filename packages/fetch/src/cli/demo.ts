/**
 * Founder demo for M02:
 *
 *   pnpm --filter @pretoscop/fetch demo https://www.dedeman.ro/robots.txt
 *
 * Makes ONE polite request (plus robots.txt when the URL is not robots.txt itself and it is not
 * cached), using the shared state file `<repo>/data/fetch-demo-state.json`, so a second
 * invocation within 5 s waits for the per-domain slot, across processes. Prints the identity,
 * the response, the wait, the block verdict and the host's robots.txt decisions.
 *
 * Options:
 *   --purpose <robots|sitemap|listing|product|feed|probe>   default: robots for /robots.txt, else probe
 *   --paths "/a,/b?x=1"   extra paths to judge against the host's robots.txt
 *   --cached              no request at all: judge paths from the robots.txt already in the state file
 *   --state <file>        another state file (the verify script uses a temporary one)
 * Exit codes: 0 response received, 2 blocked, 3 skipped (paused, robots, ...), 4 error, 64 usage.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findRepoRoot, loadRootEnvFile } from '@pretoscop/config/env';
import { DEFAULT_MIN_INTERVAL_MS, defaultDomainPolicy } from '@pretoscop/config/policy';
import { createFetcher } from '../fetcher';
import { buildUserAgent, resolveBotInfoUrl } from '../identity';
import { evaluateRobots, parseRobotsTxt } from '../robots';
import { FileDomainStateStore } from '../state/file';
import { BUCHAREST_TZ } from '../time';
import type { FetchPurpose, RequestLogEntry, RobotsDecisionInfo } from '../types';

const PURPOSES: FetchPurpose[] = ['robots', 'sitemap', 'listing', 'product', 'feed', 'probe'];
const SAMPLE_PATHS = [
  '/',
  '/cart',
  '/checkout',
  '/search?q=x',
  '/p/telefon-exemplu-123.html',
  '/checkout/',
  '/customer/account/login/',
  '/catalogsearch/result/?q=x',
];

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    'usage: pnpm --filter @pretoscop/fetch demo <url> [--purpose robots|sitemap|listing|product|feed|probe] [--paths "/a,/b"] [--cached] [--state <file>]',
  );
  process.exit(64);
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1024 / 1024).toFixed(2)} MiB`;
const localTime = (d: Date) =>
  new Intl.DateTimeFormat('ro-RO', { timeZone: BUCHAREST_TZ, dateStyle: 'short', timeStyle: 'medium' }).format(d);
const row = (label: string, value: string) => console.log(`  ${label.padEnd(14)}${value}`);

/** The rule that decides `path` for the group in `info` (same matcher as the fetcher). */
function decidingRule(info: RobotsDecisionInfo, path: string): string {
  if (info.outcome !== 'parsed') return info.allowAll ? 'no robots.txt' : `robots.txt ${info.outcome}`;
  const synthetic = ['User-agent: *', ...info.rules.map((r) => `${r.type === 'allow' ? 'Allow' : 'Disallow'}: ${r.pattern}`)].join('\n');
  const rule = evaluateRobots(parseRobotsTxt(synthetic).groups, path).rule;
  return rule ? `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.raw}` : 'no rule matches';
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      purpose: { type: 'string' },
      state: { type: 'string' },
      paths: { type: 'string' },
      cached: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) usage();
  const raw = positionals[0];
  if (!raw) usage('missing URL');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    usage(`not an absolute URL: ${raw}`);
  }
  const purpose = (values.purpose ?? (url.pathname === '/robots.txt' ? 'robots' : 'probe')) as FetchPurpose;
  if (!PURPOSES.includes(purpose)) usage(`unknown purpose "${values.purpose}"`);
  if (purpose === 'robots' && url.pathname !== '/robots.txt') usage("purpose 'robots' is only for /robots.txt URLs");
  const cachedOnly = values.cached === true;

  loadRootEnvFile();
  const statePath = values.state ?? join(findRepoRoot(), 'data', 'fetch-demo-state.json');
  const userAgent = buildUserAgent(purpose === 'feed' ? 'feed' : 'page', resolveBotInfoUrl(process.env.BOT_INFO_URL));
  const entries: RequestLogEntry[] = [];
  const crawlSwitch = process.env.CRAWL_ENABLED;
  const fetcher = createFetcher({
    stateStore: new FileDomainStateStore(statePath),
    requestLog: { write: (e) => void entries.push(e) },
    // A founder runs this by hand for one request: the global CRAWL_ENABLED switch (meant for the
    // worker) does not apply. Every other rule does.
    crawlEnabled: true,
    // --cached: every host is "off", so nothing can reach the network; only the cache is read.
    policyFor: cachedOnly ? (host) => defaultDomainPolicy(host, { accessMode: 'off' }) : undefined,
  });

  console.log(`PretoscopBot fetch demo, ${localTime(new Date())} (Europe/Bucharest)`);
  row('URL', url.href);
  row('Purpose', purpose);
  row('User-Agent', userAgent);
  row('State file', statePath);
  row('Interval', `${seconds(DEFAULT_MIN_INTERVAL_MS)} minimum per host, +0-10% jitter (Crawl-delay wins when longer)`);
  if (crawlSwitch !== undefined && !['1', 'true', 'yes', 'on'].includes(crawlSwitch.trim().toLowerCase()) && !cachedOnly) {
    row('Note', 'CRAWL_ENABLED is off in .env (the worker will not crawl); this manual demo makes its request anyway');
  }

  let exitCode = 0;
  try {
    if (cachedOnly) {
      console.log('\nResult\n  (--cached: no request made)');
    } else {
      const res = await fetcher.fetchPolite(url.href, { purpose });
      console.log('\nResult');
      if (res.skipped) {
        row('Skipped', `${res.skipped}${res.blockDetail ? `: ${res.blockDetail}` : ''}${res.error ? ` (${res.error})` : ''}`);
        if (res.skipped === 'paused') row('Hint', `the demo state is in ${statePath}; delete it to forget the pause`);
        exitCode = 3;
      } else {
        row(
          'Slot wait',
          res.waitedMs > 0 ? `waited ${seconds(res.waitedMs)} for the per-domain slot` : 'none (no request to this host in the last 5 s)',
        );
        row('Status', res.status ? `${res.status}${res.notModified ? ' (not modified)' : ''}` : 'no HTTP response');
        row('Duration', `${res.durationMs} ms on the network`);
        row('Final URL', res.finalUrl);
        row('Content-Type', res.contentType ?? '-');
        row('Size', res.bodyBytes ? bytes(res.bodyBytes.length) : '-');
        row('Attempts', String(res.attempts));
        row('Blocked', res.blocked ? `YES: ${res.blockReason} (${res.blockDetail ?? ''})` : 'no');
        if (res.error) row('Error', `${res.errorCode ?? ''} ${res.error}`.trim());
        if (res.blocked) exitCode = 2;
        else if (!res.status) exitCode = 4;
      }

      console.log('\nRequests made');
      const network = entries.filter((e) => e.attempt > 0);
      if (network.length === 0) console.log('  (none)');
      for (const e of network) {
        console.log(
          `  ${e.ts.toISOString()}  GET ${e.url}  ${e.status || '---'}  ${e.durationMs} ms  waited ${seconds(e.waitMs)}  [${e.purpose}${e.blocked ? `, BLOCKED ${e.blockReason}` : ''}]`,
        );
      }
    }

    const robots = await fetcher.robotsFor(url.origin);
    console.log(`\nrobots.txt for ${robots.host}`);
    row('Source', `${robots.source}${robots.fetchedAt ? ` (fetched ${robots.fetchedAt}, valid until ${robots.expiresAt})` : ''}`);
    row('Outcome', `${robots.outcome}${robots.status ? ` (HTTP ${robots.status})` : ''}${robots.detail ? `: ${robots.detail}` : ''}`);
    const groupNote =
      robots.matchedGroup === 'PretoscopBot'
        ? 'a group names PretoscopBot'
        : robots.matchedGroup === '*'
          ? 'no group names PretoscopBot, so the * group applies'
          : robots.matchedGroup === 'none'
            ? 'no group applies: everything allowed'
            : robots.matchedGroup === 'no-robots'
              ? 'no robots.txt (4xx): everything allowed'
              : 'robots.txt not usable: nothing is fetched (RFC 9309)';
    row('Group used', `${robots.matchedGroup} (${groupNote})`);
    row('Crawl-delay', robots.crawlDelaySec === null ? 'none' : `${robots.crawlDelaySec} s`);
    row('Sitemaps', robots.sitemaps.length ? robots.sitemaps.slice(0, 8).join('\n                ') : 'none');
    if (robots.sitemaps.length > 8) row('', `... and ${robots.sitemaps.length - 8} more`);
    row('Rules', `${robots.rules.length} for our group (${robots.groupCount} group${robots.groupCount === 1 ? '' : 's'} in the file)`);
    row(
      'Ignored',
      robots.ignoredGroups.length
        ? robots.ignoredGroups.map((g) => `${g.userAgent} (${g.reason})`).join(', ')
        : 'no generic or look-alike user-agent groups',
    );

    console.log('\n  Sample paths (decided from the cached robots.txt, no extra requests)');
    const samples = [...SAMPLE_PATHS, ...(values.paths ?? '').split(',').map((p) => p.trim()).filter(Boolean)];
    const own = `${url.pathname}${url.search}`;
    if (url.pathname !== '/robots.txt' && !samples.includes(own)) samples.push(own);
    for (const path of samples) {
      const allowed = await fetcher.isAllowedByRobots(new URL(path, url.origin).href);
      console.log(`    ${allowed ? 'ALLOWED   ' : 'DISALLOWED'}  ${path.padEnd(32)} ${decidingRule(robots, path)}`);
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
