import type { Logger } from '@pretoscop/config/logger';
import type { TelegramClient, TelegramUpdate } from '@pretoscop/notify';

/** What the poller needs from a pg pool (a dedicated connection holds the session lock). */
interface LockClient {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
  release(destroy?: boolean): void;
}
interface LockPool {
  connect(): Promise<LockClient>;
}

/** Advisory-lock key of the poller: one process polls; the others wait and take over if it dies. */
export const TELEGRAM_POLL_LOCK = 0x7e1e9a4d;

export interface Poller {
  stop(): Promise<void>;
}

export interface PollerOptions {
  pool: LockPool;
  telegram: TelegramClient;
  handle: (u: TelegramUpdate) => Promise<void>;
  log: Logger;
  /**
   * Polls only while this answers true (the flag `alerts.telegram.enabled`): with the flag off the
   * bot reads nothing and answers nothing; updates wait at Telegram (24 hours) and the stale ones
   * are dropped by the bot when it starts again.
   */
  enabled?: () => Promise<boolean>;
  lockRetryMs?: number;
  pollTimeoutSec?: number;
  /** How often the flag is read again (default 60 s). */
  flagCheckMs?: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Tries the poller's advisory lock on a dedicated connection; null when another process holds it. */
export async function tryPollLock(pool: LockPool): Promise<LockClient | null> {
  const client = await pool.connect();
  try {
    const got = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [TELEGRAM_POLL_LOCK]);
    if (got.rows[0]?.ok) return client;
  } catch (err) {
    client.release(true);
    throw err;
  }
  client.release();
  return null;
}

export async function releasePollLock(client: LockClient): Promise<void> {
  await client.query('SELECT pg_advisory_unlock($1)', [TELEGRAM_POLL_LOCK]).catch(() => undefined);
  client.release();
}

/**
 * Long polling (getUpdates, 25 s) for the Telegram bot (ADR-022). Long polling needs no public URL
 * and no inbound route through Cloudflare and Caddy, and keeps every message the bot sends in the
 * single worker process (ADR-021), so one rate limiter covers Telegram's 30 messages per second.
 * Telegram allows one consumer per bot, hence the session-level advisory lock on a dedicated
 * connection. Updates are acknowledged by moving the offset after they were handled (handlers are
 * idempotent).
 */
export function startTelegramPoller(opts: PollerOptions): Poller {
  const abort = new AbortController();
  const flagEvery = opts.flagCheckMs ?? 60_000;
  const done = (async () => {
    let client: LockClient | null = null;
    while (!abort.signal.aborted) {
      try {
        client ??= await tryPollLock(opts.pool);
        if (!client) {
          await sleep(opts.lockRetryMs ?? 60_000, abort.signal);
          continue;
        }
        opts.log.info('telegram poller holds the lock');
        let webhookCleared = false;
        let offset = 0;
        let backoff = 1000;
        let on: boolean = true;
        let checkedAt = 0;
        while (!abort.signal.aborted) {
          if (opts.enabled && Date.now() - checkedAt >= flagEvery) {
            const was: boolean = on;
            on = await opts.enabled().catch(() => false);
            checkedAt = Date.now();
            if (on !== was) opts.log.info({ enabled: on }, 'telegram bot switched');
          }
          if (!on) {
            await sleep(flagEvery, abort.signal);
            continue;
          }
          try {
            if (!webhookCleared) {
              await opts.telegram.deleteWebhook(); // getUpdates is refused while a webhook is set
              webhookCleared = true;
            }
            const updates = await opts.telegram.getUpdates(offset, opts.pollTimeoutSec ?? 25, abort.signal);
            for (const u of updates) {
              await opts.handle(u);
              offset = u.update_id + 1;
            }
            backoff = 1000;
          } catch (err) {
            if (abort.signal.aborted) break;
            const retryAfter = (err as { retryAfterSec?: number }).retryAfterSec;
            opts.log.warn({ err: (err as Error).message.slice(0, 200) }, 'telegram getUpdates failed');
            await sleep(retryAfter ? retryAfter * 1000 : backoff, abort.signal);
            backoff = Math.min(backoff * 2, 60_000);
          }
        }
      } catch (err) {
        opts.log.error({ err: (err as Error).message.slice(0, 200) }, 'telegram poller error');
        client?.release(true);
        client = null;
        await sleep(10_000, abort.signal);
      }
    }
    if (client) await releasePollLock(client);
  })();
  return {
    async stop() {
      abort.abort();
      await done;
    },
  };
}

/**
 * Handles the updates waiting at Telegram once and acknowledges them (`telegram:poll --once`, the
 * e2e test, a founder's check without the worker). Refuses while another process polls.
 */
export async function pollOnce(opts: { pool: LockPool; telegram: TelegramClient; handle: (u: TelegramUpdate) => Promise<void> }): Promise<{ handled: number } | { busy: true }> {
  const client = await tryPollLock(opts.pool);
  if (!client) return { busy: true };
  try {
    await opts.telegram.deleteWebhook();
    const updates = await opts.telegram.getUpdates(0, 0);
    let offset = 0;
    for (const u of updates) {
      await opts.handle(u);
      offset = u.update_id + 1;
    }
    if (offset > 0) await opts.telegram.getUpdates(offset, 0); // acknowledge
    return { handled: updates.length };
  } finally {
    await releasePollLock(client);
  }
}
