import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '@pretoscop/config/env';

/**
 * Email behind one interface (docs/03 §3): SMTP (Mailpit in development), Resend (production) or
 * log-only. Every module sends through `Mailer`; templates live with their module (M19 alerts).
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe / List-Unsubscribe-Post for alerts (M19). */
  headers?: Record<string, string>;
  replyTo?: string;
  tags?: Record<string, string>;
  /**
   * Same key, same email: a retry after a timeout or a crash (the provider may have accepted the
   * first attempt) is not sent twice. Resend honours it for 24 hours (`Idempotency-Key`, ≤ 256
   * characters); SMTP and the log driver ignore it.
   */
  idempotencyKey?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ id: string | null }>;
}

export function createMailer(env: Env, log?: { info: (o: object, m: string) => void }): Mailer {
  const from = env.MAIL_FROM;
  if (env.MAIL_DRIVER === 'log') {
    return {
      async send(msg) {
        log?.info({ to: msg.to, subject: msg.subject }, 'mail (log driver)');
        return { id: null };
      },
    };
  }
  if (env.MAIL_DRIVER === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('MAIL_DRIVER=resend needs RESEND_API_KEY');
    return {
      async send(msg) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            'content-type': 'application/json',
            ...(msg.idempotencyKey ? { 'idempotency-key': msg.idempotencyKey.slice(0, 256) } : {}),
          },
          body: JSON.stringify({
            from,
            to: [msg.to],
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
            headers: msg.headers,
            reply_to: msg.replyTo ?? env.MAIL_REPLY_TO,
            tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const body = (await res.json()) as { id?: string };
        return { id: body.id ?? null };
      },
    };
  }
  let transport: Transporter | undefined;
  return {
    async send(msg) {
      transport ??= nodemailer.createTransport(env.SMTP_URL);
      const info = await transport.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: msg.headers,
        replyTo: msg.replyTo ?? env.MAIL_REPLY_TO,
      });
      return { id: info.messageId ?? null };
    },
  };
}
