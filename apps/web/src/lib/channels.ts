import 'server-only';
import { isFlagEnabled, telegramLinkByUser, userPushDevices, type PushDevice, type TelegramLink } from '@pretoscop/db';
import { db, serverEnv } from './db';
import { pushPublicKey } from './push';

/** Feature flag for alerts on Telegram and the bot (M27). */
export const TELEGRAM_FLAG = 'alerts.telegram.enabled';

/** Short-lived, httpOnly cookie that carries the one-time Telegram link token to /alerte (never the URL). */
export const TELEGRAM_LINK_COOKIE = 'pretoscop_tg_link';

export interface UserChannels {
  /** VAPID public key when browser notifications are configured and on. */
  pushKey: string | null;
  /** The user's browsers: always listed, so they can be removed even with the feature off. */
  pushDevices: PushDevice[];
  /** The bot's username when Telegram is configured and on. */
  telegramBot: string | null;
  /** The linked chat: always shown, so it can be disconnected even with the feature off. */
  telegram: TelegramLink | null;
  /** Channels an alert of this user may move to right now. */
  usable: { email: true; push: boolean; telegram: boolean };
}

export async function userChannels(userId: string): Promise<UserChannels> {
  const env = serverEnv();
  const [pushKey, pushDevices, telegramOn, telegram] = await Promise.all([
    pushPublicKey(),
    userPushDevices(db(), userId),
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

/** The consent version a user gave for a channel (the newest browser's, or the Telegram link's). */
export function channelConsentVersion(ch: UserChannels, channel: 'push' | 'telegram'): string | null {
  if (channel === 'telegram') return ch.telegram?.consentTextVersion ?? null;
  const newest = [...ch.pushDevices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return newest?.consentTextVersion ?? null;
}
