import { bucharestToday, claimChannelPost, completeChannelPost, getDeals, isFlagEnabled, releaseChannelPost } from '@pretoscop/db';
import { dealsPostText } from '@pretoscop/notify';
import { defineJob } from './types';

const DEALS_CHANNEL = 'telegram:deals';
/** Products in one post (Telegram caps a message at 4096 characters). */
const POST_LIMIT = 10;

/**
 * M27: the daily "verified drops" post in the public Telegram channel (TELEGRAM_DEALS_CHAT_ID,
 * flag telegram.deals.enabled), by the M15 rules of /reduceri (`getDeals`, @pretoscop/core
 * `verifiedDrop`): today's total at least 3% under the lowest daily total we observed in the 30 days
 * before the new price level, with at least 14 of those days observed (no badge on a shorter
 * history), never a provisional product. Only drops whose level started today (the nightly crawl
 * is in by 09:15), biggest first, so a drop is posted once. Links go to Pretoscop's product pages.
 * At most one post per day (claimed before sending), none on a day without drops.
 */
export const telegramDealsJob = defineJob({
  name: 'telegram.deals',
  queue: { retryLimit: 2, retryDelay: 900, expireInSeconds: 1800 },
  schedule: { cron: '15 9 * * *' },
  handler: async (_job, { db, env, log, services }) => {
    const telegram = services.alerts.telegram;
    const chat = env.TELEGRAM_DEALS_CHAT_ID;
    if (!telegram || !chat || !(await isFlagEnabled(db, 'telegram.deals.enabled'))) return;
    const day = bucharestToday();
    const { drops } = await getDeals(db, { windowDays: 1, limit: POST_LIMIT, lowsLimit: 0 }, day);
    if (drops.length === 0) {
      log.info({ day }, 'no verified drops today: no deals post');
      return;
    }
    if (!(await claimChannelPost(db, DEALS_CHANNEL, day))) return; // already posted today
    try {
      const text = dealsPostText(
        drops.map((d) => ({
          productTitle: d.title,
          productUrl: services.alerts.links.product(d.slug),
          totalBani: d.currentBani,
          shopName: d.shopName ?? '',
          min30Bani: d.drop!.referenceBani,
          dropPct: Math.floor(d.drop!.pct * 100 + 1e-9),
        })),
        { date: new Date(), dealsUrl: `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/reduceri` },
      );
      const m = await telegram.sendMessage(chat, text);
      await completeChannelPost(db, DEALS_CHANNEL, day, String(m.message_id));
      log.info({ day, drops: drops.length }, 'telegram deals posted');
    } catch (err) {
      await releaseChannelPost(db, DEALS_CHANNEL, day);
      throw err;
    }
  },
});
