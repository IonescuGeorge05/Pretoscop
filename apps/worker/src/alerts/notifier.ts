import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { sql, type AlertChannel, type Db } from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import type { RenderedEmail } from '@pretoscop/notify';

/**
 * One message for one user on one channel (docs/05 M27 contract: `notify(userId, message, channel)`).
 * The email form is complete (subject, text, HTML, List-Unsubscribe headers); the short form
 * (title, body, url) is what push and Telegram show.
 */
export interface NotifyMessage {
  email?: RenderedEmail;
  title: string;
  body: string;
  url: string;
  /** Same key on a retry of the same rows: the provider drops a copy it already accepted. */
  idempotencyKey?: string;
}

export type NotifyResult =
  | { ok: true; id: string | null }
  /** `permanent`: the channel is gone for this user (bounce, blocked bot, expired subscription). */
  | { ok: false; permanent: boolean; error: string; retryAfterSec?: number };

export interface Notifier {
  notify(userId: string, message: NotifyMessage, channel: AlertChannel): Promise<NotifyResult>;
}

/** A channel the user can be reached on. M19 implements email; M27 adds push and Telegram. */
export type ChannelSender = (userId: string, message: NotifyMessage) => Promise<NotifyResult>;

export function createEmailSender(db: Db, mailer: Mailer, log?: Logger): ChannelSender {
  return async (userId, message) => {
    if (!message.email) return { ok: false, permanent: false, error: 'no email form of the message' };
    const r = await db.execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${userId}`);
    const to = r.rows[0]?.email;
    if (!to) return { ok: false, permanent: true, error: 'user not found' };
    try {
      const sent = await mailer.send({
        to,
        subject: message.email.subject,
        text: message.email.text,
        html: message.email.html,
        headers: message.email.headers,
        tags: { kind: 'alert' },
        idempotencyKey: message.idempotencyKey,
      });
      return { ok: true, id: sent.id };
    } catch (err) {
      log?.warn({ err: (err as Error).message }, 'alert email failed');
      return { ok: false, permanent: false, error: (err as Error).message.slice(0, 300) };
    }
  };
}

export function createNotifier(senders: Partial<Record<AlertChannel, ChannelSender>>): Notifier {
  return {
    async notify(userId, message, channel) {
      const send = senders[channel];
      if (!send) return { ok: false, permanent: false, error: `channel ${channel} not configured` };
      return send(userId, message);
    },
  };
}

/** The sender identity printed in every message (Law 506/2004 art. 12). */
export function operatorFromEnv(env: Pick<Env, 'COMPANY_LEGAL_NAME' | 'COMPANY_POSTAL_ADDRESS' | 'PUBLIC_BASE_URL'>) {
  return { name: env.COMPANY_LEGAL_NAME, address: env.COMPANY_POSTAL_ADDRESS, website: env.PUBLIC_BASE_URL.replace(/\/+$/, '') };
}
