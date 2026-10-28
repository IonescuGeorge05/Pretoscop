import { bucharestToday, claimChannelPost, completeChannelPost, isFlagEnabled, releaseChannelPost, verifiedDrops } from '@pretoscop/db';
import { dealsPostText } from '@pretoscop/notify';
import { defineJob } from './types';

const DEALS_CHANNEL = 'telegram:deals';

/**
 * M27: the daily "verified drops" post in the public Telegram channel (TELEGRAM_DEALS_CHAT_ID,
 * flag telegram.deals.enabled): products whose current shop-sold total is at least 5% under the
 * lowest total we observed in the previous 30 days (≥ 14 observed days). Links go to Pretoscop's
 * product pages. At most one post per day (claimed before sending), none on a day without drops.
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
    const drops = await verifiedDrops(db, { today: day, limit: 10, minDropPct: 5, minObservationDays: 14 });
    if (drops.length === 0) {
      log.info({ day }, 'no verified drops today: no deals post');
      return;
    }
    if (!(await claimChannelPost(db, DEALS_CHANNEL, day))) return; // already posted today
    try {
      const text = dealsPostText(
        drops.map((d) => ({ productTitle: d.title, productUrl: services.alerts.links.product(d.slug), totalBani: d.totalBani, shopName: d.shopName, min30Bani: d.min30Bani, dropPct: d.dropPct })),
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
