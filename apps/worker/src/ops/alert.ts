import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';

/**
 * Operations alerts (two consecutive source failures, held runs, backup failures, caps).
 * Always logged at `warn`; also sent to Telegram when OPS_ALERT_TELEGRAM_* are set. Never throws.
 */
export function createOpsAlert(env: Env, log: Logger) {
  return async (message: string, details: Record<string, unknown> = {}): Promise<void> => {
    log.warn({ alert: true, ...details }, message);
    if (!env.OPS_ALERT_TELEGRAM_BOT_TOKEN || !env.OPS_ALERT_TELEGRAM_CHAT_ID) return;
    const text = `⚠️ Pretoscop (${env.APP_ENV}): ${message}\n${Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n')}`.slice(0, 3500);
    try {
      await fetch(`https://api.telegram.org/bot${env.OPS_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.OPS_ALERT_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      log.error({ err }, 'telegram alert failed');
    }
  };
}
