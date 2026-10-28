import type { Logger } from '@pretoscop/config/logger';
import { parseTargetPrice } from '@pretoscop/core';
import {
  alertProduct,
  bestAlertOffer,
  consumeTelegramLinkToken,
  createAlert,
  deleteAlert,
  isFlagEnabled,
  reactivateTelegramLink,
  searchProductsForBot,
  sql,
  telegramLinkByChat,
  telegramTokenHash,
  touchUserActivity,
  unlinkTelegram,
  userAlerts,
  type Db,
} from '@pretoscop/db';
import { emailHash, lei, shorten, TelegramApiError, tgEscape, type AlertLinks, type InlineButton, type TelegramClient, type TelegramUpdate } from '@pretoscop/notify';

/**
 * The Pretoscop Telegram bot (M27). Commands (Romanian): /start <token> links the chat to the
 * account that asked for the link on /alerte (with the Telegram consent box ticked there);
 * /urmareste <link sau căutare> [preț] starts an alert on Telegram; /alertele lists alerts;
 * /oprire stops Telegram alerts and unlinks; /ajutor. Every handler is idempotent (a restarted
 * poller may see an update twice).
 *
 * Only private chats are served. Nothing the person writes is stored or logged: only the chat id
 * of a linked account (`telegram_links`) and the alerts they ask for. Updates older than
 * `STALE_AFTER_SEC` are dropped (the bot was off), and a chat sending more than
 * `CHAT_UPDATES_PER_MINUTE` updates a minute is ignored for the rest of that minute.
 */
export interface BotDeps {
  db: Db;
  telegram: TelegramClient;
  links: AlertLinks;
  /** ALERTS_SECRET (address hash for the consent ledger). */
  secret: string;
  log?: Logger;
  /** Clock (tests). */
  now?: () => Date;
  /** Per-chat inbound limiter; one per poller (tests pass their own). */
  limiter?: ChatLimiter;
}

/** Older updates are ignored: the link tokens they could carry expired after 15 minutes anyway. */
export const STALE_AFTER_SEC = 15 * 60;
export const CHAT_UPDATES_PER_MINUTE = 20;
/** Alerts one account may keep (all channels); /urmareste refuses beyond it. */
export const MAX_ALERTS_PER_USER = 100;

export interface ChatLimiter {
  /** True when this chat may be served now (and counts the update). */
  allow(chatId: number, now: number): boolean;
}

export function createChatLimiter(perMinute = CHAT_UPDATES_PER_MINUTE): ChatLimiter {
  const windows = new Map<number, { start: number; count: number }>();
  return {
    allow(chatId, now) {
      const w = windows.get(chatId);
      if (!w || now - w.start >= 60_000) {
        windows.set(chatId, { start: now, count: 1 });
        if (windows.size > 50_000) for (const [k, v] of windows) if (now - v.start >= 60_000) windows.delete(k);
        return true;
      }
      w.count++;
      return w.count <= perMinute;
    },
  };
}

const defaultLimiter = createChatLimiter();

const HELP = [
  'Comenzi:',
  '/urmareste <link Pretoscop sau căutare> [preț] — pornește o alertă; cu preț, te anunț când prețul total ajunge la el',
  '/alertele — alertele tale',
  '/oprire — opresc alertele pe Telegram și deconectez contul',
  '/ajutor — acest mesaj',
].join('\n');

async function reply(deps: BotDeps, chatId: number, text: string, buttons?: InlineButton[][]): Promise<void> {
  await deps.telegram.sendMessage(chatId, text, buttons ? { buttons } : {});
}

/** `/p/<slug>-<id>` (absolute or relative) or a bare id → product id. */
export function productIdFromText(text: string): number | null {
  const m = /\/p\/[\w-]*?-(\d{1,15})(?:[/?#]|$)/.exec(text) ?? /^#?(\d{1,12})$/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

/** Splits "/urmareste <what> [price]" into the product part and an optional trailing target. */
export function parseFollowArgs(args: string): { what: string; target: string | null } {
  const trimmed = args.trim().slice(0, 300);
  const m = /^(.*?)\s+(\d[\d.\s]*(?:,\d{1,2})?)\s*(?:lei|ron)?$/i.exec(trimmed);
  if (m && m[1] && /\D/.test(m[1])) return { what: m[1].trim(), target: m[2]!.trim() };
  return { what: trimmed, target: null };
}

async function alertCount(db: Db, userId: string): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM alerts WHERE user_id = ${userId}`);
  return Number(r.rows[0]?.n ?? 0);
}

async function follow(deps: BotDeps, chatId: number, userId: string, email: string, consentTextVersion: string, productId: number, target: string | null): Promise<void> {
  const product = await alertProduct(deps.db, productId);
  if (!product || product.status !== 'active') {
    await reply(deps, chatId, 'Nu găsesc acest produs. Trimite linkul paginii de pe Pretoscop sau caută după nume: /urmareste iphone 17 pro');
    return;
  }
  if ((await alertCount(deps.db, userId)) >= MAX_ALERTS_PER_USER) {
    await reply(deps, chatId, `Ai deja ${MAX_ALERTS_PER_USER} de alerte, cât permitem pentru un cont. Oprește câteva cu /alertele, apoi încearcă din nou.`);
    return;
  }
  const best = await bestAlertOffer(deps.db, product.id, false);
  let targetBani: number | null = null;
  if (target !== null) {
    const t = parseTargetPrice(target, best?.totalBani ?? null);
    if (!t.ok) {
      await reply(
        deps,
        chatId,
        t.error === 'not_below_current' && best
          ? `Prețul total de acum (${lei(best.totalBani)}) este deja sub ${tgEscape(target)} lei. Alege un prag mai mic.`
          : 'Nu am înțeles pragul. Exemplu: /urmareste https://pretoscop.ro/p/… 1999',
      );
      return;
    }
    targetBani = t.bani;
  }
  await createAlert(deps.db, {
    userId,
    productId: product.id,
    kind: targetBani === null ? 'any_drop' : 'below',
    targetBani,
    anyVariant: false,
    channel: 'telegram',
    consentAt: new Date(),
    consentIpHash: null,
    consentTextVersion,
    emailHash: emailHash(deps.secret, email),
    confirm: { method: 'telegram', ipHash: null },
  });
  const what = targetBani === null ? 'la orice scădere de cel puțin 1% a prețului total' : `când prețul total ajunge la ${lei(targetBani)} sau mai jos`;
  await reply(
    deps,
    chatId,
    `Urmăresc <b>${tgEscape(shorten(product.title, 90))}</b>: te anunț ${what}.${best ? `\nPrețul total minim acum: ${lei(best.totalBani)} la ${tgEscape(best.shopName)}.` : ''}\nCel mult un mesaj pe zi pentru alertă, între 8:00 și 22:00.`,
    [[{ text: 'Vezi produsul', url: deps.links.product(product.slug) }]],
  );
}

async function onCommand(deps: BotDeps, chatId: number, text: string): Promise<void> {
  const [rawCmd = '', ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, ''); // /start@PretoscopBot
  const args = rest.join(' ');
  const link = await telegramLinkByChat(deps.db, chatId);

  if (cmd === '/start' && args) {
    // Deep-link payloads are at most 64 characters of [A-Za-z0-9_-]; anything else is no token of ours.
    const r = /^[A-Za-z0-9_-]{16,64}$/.test(args)
      ? await consumeTelegramLinkToken(deps.db, telegramTokenHash(args), chatId, (email) => emailHash(deps.secret, email))
      : null;
    if (!r) {
      await reply(deps, chatId, `Linkul de conectare a expirat sau a fost folosit deja. Cere unul nou din pagina Alertele mele: ${deps.links.manage()}`);
      return;
    }
    deps.log?.info({ relinked: r.relinked }, 'telegram chat linked');
    await reply(
      deps,
      chatId,
      `Gata, contul tău Pretoscop este conectat. Îți trimit aici alertele de preț pe care le alegi pe Telegram.\nDacă nu tu ai cerut conectarea, trimite /oprire.\n\n${HELP}`,
    );
    return;
  }
  if (cmd === '/start' && link?.status === 'blocked') {
    // Unblocked and started again: the same chat, the same consent; the paused alerts resume.
    await reactivateTelegramLink(deps.db, link.userId);
    await touchUserActivity(deps.db, link.userId);
    await reply(deps, chatId, `Bine ai revenit! Îți trimit din nou aici alertele de preț de pe Telegram.\n\n${HELP}`);
    return;
  }
  if (cmd === '/start' || cmd === '/ajutor' || cmd === '/help') {
    await reply(
      deps,
      chatId,
      link
        ? HELP
        : `Bună! Sunt robotul Pretoscop pentru alerte de preț. Ca să primești alerte aici, conectează-ți contul din pagina Alertele mele: ${deps.links.manage()}`,
    );
    return;
  }
  if (!link || link.status !== 'active') {
    await reply(deps, chatId, `Contul tău nu este conectat. Conectează-l din pagina Alertele mele: ${deps.links.manage()}`);
    return;
  }
  // Using the bot is activity: the 24-month retention clock starts again.
  await touchUserActivity(deps.db, link.userId);

  if (cmd === '/oprire' || cmd === '/stop') {
    await unlinkTelegram(deps.db, link.userId, 'telegram');
    await reply(deps, chatId, `Am oprit alertele pe Telegram și am deconectat contul. Le poți porni din nou oricând din ${deps.links.manage()}`);
    return;
  }
  if (cmd === '/alertele' || cmd === '/alerte') {
    const list = await userAlerts(deps.db, link.userId);
    if (list.length === 0) {
      await reply(deps, chatId, 'Nu ai alerte. Pornește una cu /urmareste <link sau căutare>.');
      return;
    }
    const shown = list.slice(0, 10);
    const lines = shown.map((a, i) => {
      const what = a.kind === 'below' && a.targetBani !== null ? `sub ${lei(a.targetBani)}` : 'orice scădere';
      const where = a.channel === 'telegram' ? 'Telegram' : a.channel === 'push' ? 'notificări' : 'email';
      return `${i + 1}. ${tgEscape(shorten(a.productTitle, 70))} · ${what} · ${where}${a.status === 'active' ? '' : a.status === 'pending' ? ' (neconfirmată)' : ' (oprită)'}`;
    });
    const buttons: InlineButton[][] = shown.map((a, i) => [{ text: `Oprește ${i + 1}`, callback_data: `d:${a.id}` }]);
    await reply(deps, chatId, `<b>Alertele tale</b>\n${lines.join('\n')}${list.length > shown.length ? `\n… și încă ${list.length - shown.length} în ${deps.links.manage()}` : ''}`, buttons);
    return;
  }
  if (cmd === '/urmareste' || cmd === '/follow') {
    if (!(await isFlagEnabled(deps.db, 'alerts.telegram.enabled'))) {
      await reply(deps, chatId, 'Alertele pe Telegram pornesc în curând.');
      return;
    }
    const { what, target } = parseFollowArgs(args);
    if (!what) {
      await reply(deps, chatId, 'Scrie ce urmăresc. Exemple:\n/urmareste https://pretoscop.ro/p/…\n/urmareste iphone 17 pro 256\n/urmareste https://pretoscop.ro/p/… 1999');
      return;
    }
    const id = productIdFromText(what);
    if (id !== null) {
      await follow(deps, chatId, link.userId, link.email, link.consentTextVersion, id, target);
      return;
    }
    const found = await searchProductsForBot(deps.db, what, 5);
    if (found.length === 0) {
      await reply(deps, chatId, 'Nu am găsit niciun produs. Încearcă alte cuvinte sau trimite linkul paginii de pe Pretoscop.');
      return;
    }
    const buttons: InlineButton[][] = found.map((p) => [{ text: shorten(`${p.title}${p.minTotalBani !== null ? ` · ${lei(p.minTotalBani)}` : ''}`, 60), callback_data: `f:${p.id}` }]);
    await reply(deps, chatId, 'Pe care îl urmăresc? (la orice scădere de cel puțin 1%)', buttons);
    return;
  }
  await reply(deps, chatId, HELP);
}

async function onCallback(deps: BotDeps, q: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
  const chatId = q.message?.chat.id;
  const data = q.data ?? '';
  // Buttons only in the private chat with the person who pressed them.
  if (!chatId || q.message?.chat.type !== 'private' || q.from.id !== chatId) {
    await deps.telegram.answerCallbackQuery(q.id);
    return;
  }
  const link = await telegramLinkByChat(deps.db, chatId);
  if (!link || link.status !== 'active') {
    await deps.telegram.answerCallbackQuery(q.id, 'Contul nu este conectat.');
    return;
  }
  const m = /^([fd]):(\d{1,15})$/.exec(data);
  if (!m) {
    await deps.telegram.answerCallbackQuery(q.id);
    return;
  }
  await touchUserActivity(deps.db, link.userId);
  if (m[1] === 'd') {
    const removed = await deleteAlert(deps.db, Number(m[2]), { method: 'telegram', userId: link.userId });
    await deps.telegram.answerCallbackQuery(q.id, removed ? 'Alerta a fost oprită.' : 'Alerta nu mai există.');
    if (removed) await reply(deps, chatId, 'Am oprit alerta.');
    return;
  }
  await deps.telegram.answerCallbackQuery(q.id);
  if (!(await isFlagEnabled(deps.db, 'alerts.telegram.enabled'))) {
    await reply(deps, chatId, 'Alertele pe Telegram pornesc în curând.');
    return;
  }
  await follow(deps, chatId, link.userId, link.email, link.consentTextVersion, Number(m[2]), null);
}

/** Handles one update; never throws for a bad command (the poller must keep going). */
export async function handleUpdate(deps: BotDeps, update: TelegramUpdate): Promise<void> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const limiter = deps.limiter ?? defaultLimiter;
  try {
    if (update.callback_query) {
      const chat = update.callback_query.message?.chat.id ?? update.callback_query.from.id;
      if (!limiter.allow(chat, now)) return;
      await onCallback(deps, update.callback_query);
      return;
    }
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== 'private') return; // only one-to-one chats
    if (msg.date !== undefined && msg.date * 1000 < now - STALE_AFTER_SEC * 1000) return;
    if (!limiter.allow(msg.chat.id, now)) return;
    await onCommand(deps, msg.chat.id, msg.text.slice(0, 1000));
  } catch (err) {
    // Never the message text, nor a database error's message (its parameters may hold what the
    // person wrote): the error's kind and code and the update id are enough to investigate.
    const e = err as Error & { code?: string | number; cause?: { code?: string } };
    deps.log?.warn(
      { error: e.name, code: e.code ?? e.cause?.code, ...(err instanceof TelegramApiError ? { telegram: e.message.slice(0, 200) } : {}), update_id: update.update_id },
      'telegram update failed',
    );
  }
}
