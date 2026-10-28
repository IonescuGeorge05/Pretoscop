import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import type { Mailer } from '@pretoscop/mailer';

export type OpsAlertFn = (message: string, details?: Record<string, unknown>) => Promise<void>;

function render(env: Env, message: string, details: Record<string, unknown>): string {
  return `⚠️ Pretoscop (${env.APP_ENV}): ${message}\n${Object.entries(details)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')}`.slice(0, 3500);
}

/**
 * Operations alerts (two consecutive source failures, held runs, backup failures, SLO breaches,
 * caps). Always logged at `warn`; sent to Telegram when OPS_ALERT_TELEGRAM_* are set and by email
 * to OPS_ALERT_EMAIL (comma-separated) when a mailer is given. Never throws.
 */
export function createOpsAlert(env: Env, log: Logger, mailer?: Mailer): OpsAlertFn {
  const emails = (env.OPS_ALERT_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return async (message, details = {}) => {
    log.warn({ alert: true, ...details }, message);
    const text = render(env, message, details);
    const sends: Promise<unknown>[] = [];
    if (env.OPS_ALERT_TELEGRAM_BOT_TOKEN && env.OPS_ALERT_TELEGRAM_CHAT_ID) {
      sends.push(
        fetch(`https://api.telegram.org/bot${env.OPS_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: env.OPS_ALERT_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(10_000),
        })
          .then((res) => {
            if (!res.ok) log.error({ status: res.status }, 'telegram alert refused');
          })
          .catch((err: unknown) => log.error({ err }, 'telegram alert failed')),
      );
    }
    if (mailer) {
      for (const to of emails) {
        sends.push(
          mailer
            .send({ to, subject: `[Pretoscop ${env.APP_ENV}] ${message}`.slice(0, 180), text, tags: { kind: 'ops-alert' } })
            .catch((err: unknown) => log.error({ err }, 'email alert failed')),
        );
      }
    }
    await Promise.all(sends);
  };
}
