/**
 * Sends one test ops alert through every configured channel (Telegram, email) and pings the
 * worker heartbeat, so a founder can check the phone setup (infra/monitoring/README.md):
 *   pnpm --filter @pretoscop/worker ops:alert-test        (in the container: node --import tsx src/cli/ops-alert-test.ts)
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createMailer } from '@pretoscop/mailer';
import { createOpsAlert } from '../ops/alert';
import { pingHeartbeat } from '../ops/heartbeat';

loadRootEnvFile();
const env = getEnv();
const log = createLogger('ops-alert-test');
const mailer = env.OPS_ALERT_EMAIL ? createMailer(env, log) : undefined;
const channels = [
  env.OPS_ALERT_TELEGRAM_BOT_TOKEN && env.OPS_ALERT_TELEGRAM_CHAT_ID ? 'telegram' : null,
  mailer ? `email (${env.OPS_ALERT_EMAIL})` : null,
].filter(Boolean);
await createOpsAlert(env, log, mailer)('Test alert: the ops alert channel works', {
  sent_at: new Date().toISOString(),
  version: process.env.APP_VERSION ?? 'dev',
});
const beat = await pingHeartbeat(env.OPS_HEARTBEAT_URL, log);
console.log(`alert sent via: ${channels.length ? channels.join(', ') : 'log only (no channel configured)'}; heartbeat ping: ${env.OPS_HEARTBEAT_URL ? (beat ? 'ok' : 'failed') : 'not configured'}`);
