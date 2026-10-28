/**
 * The Telegram bot without the worker (M27; founder checks, the e2e test):
 *   pnpm --filter @pretoscop/worker telegram:poll --once   handle the waiting updates once, then exit
 *   pnpm --filter @pretoscop/worker telegram:poll          long-poll until Ctrl+C
 * Needs TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME (TELEGRAM_API_BASE points tests at a mock) and
 * the flag alerts.telegram.enabled. Refuses while another process (the worker) polls the same bot.
 * Prints one JSON line.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, isFlagEnabled } from '@pretoscop/db';
import { createAlertServices } from '../services';
import { createChatLimiter, handleUpdate } from '../telegram/bot';
import { pollOnce, startTelegramPoller } from '../telegram/poller';

loadRootEnvFile();
const { values } = parseArgs({ options: { once: { type: 'boolean', default: false } } });
const env = getEnv();
const log = createLogger('telegram-poll');
const pool = createPool(env.DATABASE_URL, 3);
const db = createDb(pool);
const services = createAlertServices(env, db, log);
const telegram = services.telegram;
if (!telegram) {
  console.error('TELEGRAM_BOT_TOKEN is not set: no bot to run');
  await pool.end();
  process.exit(2);
}
if (!(await isFlagEnabled(db, 'alerts.telegram.enabled'))) {
  console.error('the flag alerts.telegram.enabled is off: the bot answers nothing (turn it on in /admin or with setFlag)');
  await pool.end();
  process.exit(2);
}
const limiter = createChatLimiter();
const handle = (u: Parameters<typeof handleUpdate>[1]) => handleUpdate({ db, telegram, links: services.links, secret: services.secret, log, limiter }, u);
if (values.once) {
  try {
    const r = await pollOnce({ pool, telegram, handle });
    console.log(JSON.stringify(r));
    if ('busy' in r) process.exitCode = 3;
  } finally {
    await pool.end();
  }
} else {
  const poller = startTelegramPoller({ pool, telegram, handle, log, enabled: () => isFlagEnabled(db, 'alerts.telegram.enabled') });
  const stop = async () => {
    await poller.stop();
    await pool.end();
    console.log(JSON.stringify({ stopped: true }));
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}
