import { createHash } from 'node:crypto';
import type { Logger } from '@pretoscop/config/logger';
import { inQuietHours } from '@pretoscop/core';
import {
  claimQueuedSends,
  finishSends,
  pauseChannelAlerts,
  recoverStuckSends,
  sendsByIds,
  sql,
  suppressionReason,
  type AlertChannel,
  type Db,
  type QueuedSend,
} from '@pretoscop/db';
import { emailHash, type AlertLinks, type Operator } from '@pretoscop/notify';
import { buildAlertMessage } from './messages';
import type { Notifier } from './notifier';

/** Attempts per row before a transient failure becomes final. */
export const MAX_ATTEMPTS = 3;

export interface DeliverDeps {
  db: Db;
  notifier: Notifier;
  links: AlertLinks;
  operator: Operator;
  /** ALERTS_SECRET, for the suppression-list lookup. */
  secret: string;
  log?: Logger;
}

export interface DeliverResult {
  messages: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  recovered: number;
}

function groupKey(s: QueuedSend): string {
  return `${s.userId}\u0000${s.channel}\u0000${s.simulated ? 1 : 0}`;
}

/** Idempotency key of one message: the alert_sends ids it carries. */
export function sendsKey(ids: number[]): string {
  const list = [...ids].sort((a, b) => a - b).join(',');
  return `alert-sends-${createHash('sha256').update(list).digest('hex').slice(0, 40)}`;
}

/** Delivers one user's rows on one channel as one message. */
async function deliverGroup(deps: DeliverDeps, rows: QueuedSend[], out: DeliverResult): Promise<void> {
  const { db, log } = deps;
  const first = rows[0]!;
  const stale = rows.filter((r) => !r.stillValid);
  if (stale.length) {
    // The price moved or the offer stopped qualifying since evaluation: never send an outdated
    // price. The alert gets its state back and the next evaluation decides afresh.
    await finishSends(db, stale.map((r) => r.id), 'skipped', 'offer changed before delivery');
    out.skipped += stale.length;
  }
  const valid = rows.filter((r) => r.stillValid);
  if (valid.length === 0) return;
  const ids = valid.map((r) => r.id);

  if (first.channel === 'email') {
    const reason = await suppressionReason(db, emailHash(deps.secret, first.email));
    if (reason) {
      // Never email a suppressed address; pause its email alerts so they are not re-queued.
      await finishSends(db, ids, 'skipped', `suppressed: ${reason}`);
      if (!first.simulated) await pauseChannelAlerts(db, first.userId, 'email', 'suppressed');
      out.skipped += ids.length;
      return;
    }
  }

  // The same rows always make the same key: a retry after a timeout or a crash (the provider may
  // have accepted the first attempt) is dropped by the provider instead of arriving twice.
  const message = { ...buildAlertMessage(valid, deps.links, deps.operator), idempotencyKey: sendsKey(ids) };
  const res = await deps.notifier.notify(first.userId, message, first.channel);
  out.messages++;
  if (res.ok) {
    await finishSends(db, ids, 'sent', res.id);
    out.sent += ids.length;
    log?.info({ user_alerts: ids.length, channel: first.channel, simulated: first.simulated }, 'alert notification sent');
    return;
  }
  if (res.permanent) {
    await finishSends(db, ids, 'failed', res.error);
    const paused = first.simulated ? 0 : await pauseChannelAlerts(db, first.userId, first.channel, 'channel_unavailable');
    out.failed += ids.length;
    log?.warn({ channel: first.channel, paused, error: res.error }, 'alert channel unavailable: alerts paused');
    return;
  }
  const final = valid.filter((r) => r.attempts >= MAX_ATTEMPTS).map((r) => r.id);
  const again = valid.filter((r) => r.attempts < MAX_ATTEMPTS);
  if (final.length) {
    await finishSends(db, final, 'failed', res.error);
    out.failed += final.length;
  }
  if (again.length) {
    const delayMin = Math.max(Math.ceil((res.retryAfterSec ?? 0) / 60), 10 * Math.max(...again.map((r) => r.attempts)));
    await finishSends(db, again.map((r) => r.id), 'retry', res.error, { retryMinutes: delayMin });
    out.retried += again.length;
  }
  log?.warn({ channel: first.channel, error: res.error, retried: again.length, failed: final.length }, 'alert notification failed');
}

async function deliverRows(deps: DeliverDeps, rows: QueuedSend[], out: DeliverResult): Promise<void> {
  const groups = new Map<string, QueuedSend[]>();
  for (const r of rows) {
    const k = groupKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  for (const g of groups.values()) {
    try {
      await deliverGroup(deps, g, out);
    } catch (err) {
      // Unexpected (database, template): retry later, never lose the rows in 'sending'.
      await finishSends(deps.db, g.map((r) => r.id), 'retry', `error: ${(err as Error).message.slice(0, 200)}`, { retryMinutes: 15 });
      out.retried += g.length;
      deps.log?.error({ err }, 'alert delivery error');
    }
  }
}

/**
 * Sends every due notification on the enabled channels, one message per user and channel.
 * Push and Telegram wait outside quiet hours (22:00–08:00 Romania time); email goes at once.
 */
export async function deliverAlerts(deps: DeliverDeps, opts: { channels: AlertChannel[]; now?: Date; maxBatches?: number }): Promise<DeliverResult> {
  const out: DeliverResult = { messages: 0, sent: 0, skipped: 0, retried: 0, failed: 0, recovered: 0 };
  out.recovered = await recoverStuckSends(deps.db, 15, MAX_ATTEMPTS);
  const quiet = inQuietHours(opts.now ?? new Date());
  const channels = opts.channels.filter((c) => c === 'email' || !quiet);
  for (let batch = 0; batch < (opts.maxBatches ?? 50); batch++) {
    const rows = await claimQueuedSends(deps.db, { channels, limit: 200 });
    if (rows.length === 0) break;
    await deliverRows(deps, rows, out);
  }
  return out;
}

/** Delivers specific rows at once (the simulation CLI), whatever their channel flag. */
export async function deliverSendsNow(deps: DeliverDeps, ids: number[]): Promise<DeliverResult> {
  const out: DeliverResult = { messages: 0, sent: 0, skipped: 0, retried: 0, failed: 0, recovered: 0 };
  await deps.db.execute(sql`
    UPDATE alert_sends SET status = 'sending', attempts = attempts + 1, not_before = now()
    WHERE id = ANY(${sql.param(ids)}::bigint[]) AND status = 'queued'`);
  await deliverRows(deps, await sendsByIds(deps.db, ids), out);
  return out;
}
