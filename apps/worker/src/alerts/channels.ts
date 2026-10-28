import type { Logger } from '@pretoscop/config/logger';
import {
  deletePushSubscription,
  hasDeliveryReceipt,
  markPushResult,
  markTelegramBlocked,
  recordDeliveryReceipt,
  telegramLinkByUser,
  userPushSubscriptions,
  type Db,
} from '@pretoscop/db';
import { pushTopic, TelegramApiError, tgEscape, type PushSender, type TelegramClient } from '@pretoscop/notify';
import type { ChannelSender } from './notifier';

/**
 * Web Push (M27): the message goes to every browser the user turned on. A subscription the push
 * service reports gone (404/410), or whose endpoint we would no longer accept, is deleted; with
 * none left the user's push alerts pause. With an idempotency key, each browser that already got
 * this message (a receipt) is skipped on a retry, and the Topic header lets the push service
 * replace an undelivered copy. Never logs the endpoint or the message.
 */
export function createPushChannelSender(db: Db, push: PushSender, log?: Logger): ChannelSender {
  return async (userId, message) => {
    const subs = await userPushSubscriptions(db, userId);
    if (subs.length === 0) return { ok: false, permanent: true, error: 'no push subscription' };
    const payload = message.push ?? { title: message.title, body: message.body, url: message.url };
    const key = message.idempotencyKey;
    let delivered = 0;
    let lastError = 'push failed';
    let retryAfterSec: number | undefined;
    for (const s of subs) {
      const target = `push:${s.id}`;
      if (key && (await hasDeliveryReceipt(db, key, target))) {
        delivered++;
        continue;
      }
      const r = await push.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, {
        ttlSec: 24 * 3600,
        urgency: 'normal',
        ...(key ? { topic: pushTopic(key) } : {}),
      });
      if (r.ok) {
        delivered++;
        if (key) await recordDeliveryReceipt(db, key, target, String(r.status));
        await markPushResult(db, s.id, true);
      } else if (r.gone) {
        await deletePushSubscription(db, { userId, id: s.id }, 'push_expired');
        log?.info({ status: r.status, subscription_id: s.id }, 'push subscription gone: removed');
      } else {
        lastError = r.error;
        retryAfterSec = r.retryAfterSec ?? retryAfterSec;
        await markPushResult(db, s.id, false);
      }
    }
    if (delivered > 0) return { ok: true, id: `push:${delivered}/${subs.length}` };
    if ((await userPushSubscriptions(db, userId)).length === 0) return { ok: false, permanent: true, error: 'push subscriptions expired' };
    return { ok: false, permanent: false, error: lastError, ...(retryAfterSec ? { retryAfterSec } : {}) };
  };
}

/**
 * Telegram (M27): one message to the linked chat; a blocked bot pauses the user's Telegram alerts.
 * With an idempotency key, a retry after a message Telegram already accepted (recorded as a receipt
 * right after the answer) sends nothing. Never logs the chat id or the text.
 */
export function createTelegramChannelSender(db: Db, telegram: TelegramClient, log?: Logger): ChannelSender {
  return async (userId, message) => {
    const link = await telegramLinkByUser(db, userId);
    if (!link || link.status !== 'active') return { ok: false, permanent: true, error: 'telegram not linked' };
    const key = message.idempotencyKey;
    if (key && (await hasDeliveryReceipt(db, key, 'telegram'))) return { ok: true, id: 'tg:already-sent' };
    const form = message.telegram ?? { text: `<b>${tgEscape(message.title)}</b>\n${tgEscape(message.body)}\n${tgEscape(message.url)}`, buttons: [] };
    try {
      const sent = await telegram.sendMessage(link.chatId, form.text, { buttons: form.buttons });
      if (key) await recordDeliveryReceipt(db, key, 'telegram', String(sent.message_id));
      return { ok: true, id: `tg:${sent.message_id}` };
    } catch (err) {
      if (err instanceof TelegramApiError) {
        if (err.blocked) {
          await markTelegramBlocked(db, userId, `${err.code} ${err.description}`);
          log?.info('telegram chat blocked the bot: alerts paused');
          return { ok: false, permanent: true, error: err.message };
        }
        return { ok: false, permanent: false, error: err.message, ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) };
      }
      return { ok: false, permanent: false, error: (err as Error).message.slice(0, 300) };
    }
  };
}
