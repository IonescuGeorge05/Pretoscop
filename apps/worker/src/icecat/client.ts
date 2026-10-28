import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import { type Db, icecatUsage, reserveIcecatUsage } from '@pretoscop/db';
import { createFetcher, MemoryDomainStateStore, type RequestLogSink } from '@pretoscop/fetch';
import { createIcecatClient, type IcecatClient, type IcecatUsageStore } from '@pretoscop/icecat';
import { PgRequestLogSink } from '../fetch/request-log';

/** Monthly datasheet counter in PostgreSQL (interim: `fetch_domain_daily` rows keyed `icecat:<LANG>`). */
export class PgIcecatUsage implements IcecatUsageStore {
  constructor(private readonly db: Db) {}
  reserve(lang: string, cap: number, now: Date) {
    return reserveIcecatUsage(this.db, lang, cap, now);
  }
  used(lang: string, now: Date) {
    return icecatUsage(this.db, lang, now);
  }
}

export interface WorkerIcecat {
  client: IcecatClient;
  close(): Promise<void>;
}

/**
 * The Icecat client of the worker: its own polite fetcher (PretoscopBot-Feed identity, robots.txt
 * of the Icecat hosts obeyed, `ICECAT_MIN_INTERVAL_MS` between requests per host, request log),
 * allowed to reach only the API host and `*.icecat.biz`. Its pause state is in memory, apart from
 * the crawler's shared state: Icecat's per-product 403 answers must not pause shops' hosts, and a
 * real block still stops the run (the client reports it). The global CRAWL_ENABLED switch is for
 * shops; Icecat runs only under the flag `icecat.enabled` and with an account name.
 */
export function createWorkerIcecat(
  env: Env,
  db: Db,
  log: Logger,
  overrides: {
    baseUrl?: string;
    shopname?: string;
    usage?: IcecatUsageStore;
    requestLog?: RequestLogSink;
  } = {},
): WorkerIcecat {
  const baseUrl = overrides.baseUrl ?? env.ICECAT_BASE_URL;
  const apiHost = new URL(baseUrl).host;
  const allowed = (host: string) =>
    host === apiHost || host === 'icecat.biz' || host.endsWith('.icecat.biz');
  const sink = overrides.requestLog ?? new PgRequestLogSink(db, log);
  const fetcher = createFetcher({
    stateStore: new MemoryDomainStateStore(),
    crawlEnabled: true,
    policyFor: (host) =>
      defaultDomainPolicy(host, {
        shopSlug: 'icecat',
        accessMode: allowed(host) ? 'direct' : 'off',
        minIntervalMs: Math.max(0, env.ICECAT_MIN_INTERVAL_MS),
      }),
    requestLog: sink,
    botInfoUrl: env.BOT_INFO_URL,
    defaultTimeoutMs: env.FETCH_TIMEOUT_MS,
    // The fetch layer warns "blocked by the shop" on every 403; for Icecat a bare 403 is a
    // per-product answer, so only errors are logged here (real blocks stop the run and alert).
    logger: log.child({ component: 'icecat-fetch' }, { level: 'error' }),
  });
  const shopname = overrides.shopname ?? env.ICECAT_USERNAME;
  if (!shopname) throw new Error('ICECAT_USERNAME is not set (Open Icecat account, docs/09 B1)');
  const client = createIcecatClient({
    fetcher,
    shopname,
    baseUrl,
    usage: overrides.usage ?? new PgIcecatUsage(db),
    monthlyCap: env.ICECAT_MONTHLY_CAP,
  });
  return {
    client,
    async close() {
      if (sink instanceof PgRequestLogSink) await sink.flush();
      await fetcher.close();
    },
  };
}

/** `RO,EN` → `['RO', 'EN']`. */
export function icecatLangs(env: Env): string[] {
  const langs = env.ICECAT_LANGS.split(',')
    .map((l) => l.trim().toUpperCase())
    .filter((l) => /^[A-Z]{2}$/.test(l));
  return langs.length > 0 ? [...new Set(langs)] : ['RO'];
}
