import 'server-only';
import { isFlagEnabled, telegramLinkByUser, userPushSubscriptions, type PushSubscriptionRow, type TelegramLink } from '@pretoscop/db';
import { db, serverEnv } from './db';
import { pushPublicKey } from './push';

/** Feature flag for alerts on Telegram and the bot (M27). */
export const TELEGRAM_FLAG = 'alerts.telegram.enabled';

export interface UserChannels {
  /** VAPID public key when browser notifications are configured and on. */
  pushKey: string | null;
  pushDevices: PushSubscriptionRow[];
  /** The bot's username when Telegram is configured and on. */
  telegramBot: string | null;
  telegram: TelegramLink | null;
  /** Channels an alert of this user may use right now. */
  usable: { email: true; push: boolean; telegram: boolean };
}

export async function userChannels(userId: string): Promise<UserChannels> {
  const env = serverEnv();
  const [pushKey, pushDevices, telegramOn, telegram] = await Promise.all([
    pushPublicKey(),
    userPushSubscriptions(db(), userId),
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME ? isFlagEnabled(db(), TELEGRAM_FLAG).catch(() => false) : Promise.resolve(false),
    telegramLinkByUser(db(), userId),
  ]);
  const telegramBot = telegramOn ? (env.TELEGRAM_BOT_USERNAME ?? null) : null;
  return {
    pushKey,
    pushDevices,
    telegramBot,
    telegram,
    usable: { email: true, push: pushKey !== null && pushDevices.length > 0, telegram: telegramBot !== null && telegram?.status === 'active' },
  };
}
