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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * Long polling (getUpdates, 25 s) for the Telegram bot. Long polling needs no public URL, so the
 * same code runs on a laptop and in production; Telegram allows one consumer per bot, hence the
 * session-level advisory lock on a dedicated connection. Updates are acknowledged by moving the
 * offset after they were handled (handlers are idempotent).
 */
export function startTelegramPoller(opts: {
  pool: LockPool;
  telegram: TelegramClient;
  handle: (u: TelegramUpdate) => Promise<void>;
  log: Logger;
  lockRetryMs?: number;
  pollTimeoutSec?: number;
}): Poller {
  const abort = new AbortController();
  const done = (async () => {
    let client: LockClient | null = null;
    while (!abort.signal.aborted) {
      try {
        client ??= await opts.pool.connect();
        const got = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [TELEGRAM_POLL_LOCK]);
        if (!got.rows[0]?.ok) {
          await sleep(opts.lockRetryMs ?? 60_000, abort.signal);
          continue;
        }
        opts.log.info('telegram poller started');
        await opts.telegram.deleteWebhook().catch(() => undefined); // getUpdates is refused while a webhook is set
        let offset = 0;
        let backoff = 1000;
        while (!abort.signal.aborted) {
          try {
            const updates = await opts.telegram.getUpdates(offset, opts.pollTimeoutSec ?? 25, abort.signal);
            for (const u of updates) {
              await opts.handle(u);
              offset = u.update_id + 1;
            }
            backoff = 1000;
          } catch (err) {
            if (abort.signal.aborted) break;
            const retryAfter = (err as { retryAfterSec?: number }).retryAfterSec;
            opts.log.warn({ err: (err as Error).message }, 'telegram getUpdates failed');
            await sleep(retryAfter ? retryAfter * 1000 : backoff, abort.signal);
            backoff = Math.min(backoff * 2, 60_000);
          }
        }
      } catch (err) {
        opts.log.error({ err }, 'telegram poller error');
        client?.release(true);
        client = null;
        await sleep(10_000, abort.signal);
      }
    }
    if (client) {
      await client.query('SELECT pg_advisory_unlock($1)', [TELEGRAM_POLL_LOCK]).catch(() => undefined);
      client.release();
    }
  })();
  return {
    async stop() {
      abort.abort();
      await done;
    },
  };
}
