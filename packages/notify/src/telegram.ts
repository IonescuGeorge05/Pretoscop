/**
 * Telegram Bot API client (M27): plain `fetch` against `${apiBase}/bot<token>/<method>` (tests point
 * `apiBase` at a local mock). Outgoing messages are spaced to stay under Telegram's limits: about
 * 30 messages per second overall (we use 25) and one per second per chat. A 429 answer
 * ("retry after N") holds every further message of this client for N seconds; a message that would
 * wait longer than `maxWaitMs` fails at once with a local 429 (the caller retries later).
 * The bot token is part of every request URL: it never appears in an error message.
 */
export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  /** Unix time (seconds) the message was sent. */
  date?: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; from: TelegramUser; message?: TelegramMessage; data?: string };
}

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string };

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly description: string,
    readonly retryAfterSec?: number,
  ) {
    super(`telegram ${method}: ${code} ${description}`);
  }

  /** The person blocked the bot, deleted the chat or the account: stop writing to this chat. */
  get blocked(): boolean {
    return this.code === 403 || (this.code === 400 && /chat not found|user is deactivated|bot was blocked|kicked/i.test(this.description));
  }
}

export interface TelegramClientOptions {
  token: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  /** Minimum spacing between any two messages (default 40 ms = 25/s). */
  globalIntervalMs?: number;
  /** Minimum spacing between two messages to the same chat (default 1 s). */
  chatIntervalMs?: number;
  /** Longest a message may wait for its slot before failing with a local 429 (default 30 s). */
  maxWaitMs?: number;
}

export interface TelegramClient {
  call<T>(method: string, params: Record<string, unknown>, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<T>;
  getMe(): Promise<TelegramUser>;
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
  sendMessage(chatId: number | string, text: string, opts?: { buttons?: InlineButton[][] }): Promise<TelegramMessage>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  deleteWebhook(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTelegramClient(o: TelegramClientOptions): TelegramClient {
  const base = `${(o.apiBase ?? 'https://api.telegram.org').replace(/\/+$/, '')}/bot${o.token}`;
  const doFetch = o.fetchImpl ?? fetch;
  const globalGap = o.globalIntervalMs ?? 40;
  const chatGap = o.chatIntervalMs ?? 1000;
  const maxWait = o.maxWaitMs ?? 30_000;
  let nextGlobal = 0;
  /** Set by a 429: nothing is sent before this time. */
  let heldUntil = 0;
  const nextByChat = new Map<string, number>();
  const redact = (text: string) => (o.token ? text.split(o.token).join('<token>') : text);

  /**
   * Reserves the next slot for a chat (synchronous bookkeeping, then the caller waits). Throws a
   * local 429 instead of reserving when the slot is further away than `maxWaitMs`.
   */
  function reserve(chatId: string): number {
    const now = Date.now();
    const at = Math.max(now, nextGlobal, heldUntil, nextByChat.get(chatId) ?? 0);
    if (at - now > maxWait) throw new TelegramApiError('sendMessage', 429, 'local rate limit', Math.ceil((at - now) / 1000));
    nextGlobal = at + globalGap;
    nextByChat.set(chatId, at + chatGap);
    if (nextByChat.size > 10_000) for (const [k, v] of nextByChat) if (v < now) nextByChat.delete(k);
    return at - now;
  }

  async function call<T>(method: string, params: Record<string, unknown>, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await doFetch(`${base}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        redirect: 'error',
        signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      });
    } catch (err) {
      const e = err as Error & { cause?: { message?: string } };
      const cause = e.cause?.message ? `: ${e.cause.message}` : '';
      throw Object.assign(new Error(redact(`telegram ${method}: ${e.message}${cause}`)), { name: e.name });
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } } | null;
    if (!body?.ok) {
      const retryAfter = body?.parameters?.retry_after;
      if ((body?.error_code ?? res.status) === 429 && retryAfter) heldUntil = Math.max(heldUntil, Date.now() + retryAfter * 1000);
      throw new TelegramApiError(method, body?.error_code ?? res.status, redact(body?.description ?? res.statusText), retryAfter);
    }
    return body.result as T;
  }

  return {
    call,
    getMe: () => call<TelegramUser>('getMe', {}),
    getUpdates: (offset, timeoutSec, signal) =>
      call<TelegramUpdate[]>('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }, { timeoutMs: (timeoutSec + 15) * 1000, signal }),
    async sendMessage(chatId, text, opts = {}) {
      const wait = reserve(String(chatId));
      if (wait > 0) await sleep(wait);
      return call<TelegramMessage>('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(opts.buttons?.length ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
      });
    },
    async answerCallbackQuery(id, text) {
      await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
    },
    async deleteWebhook() {
      await call('deleteWebhook', { drop_pending_updates: false });
    },
  };
}

/** Escapes text for Telegram's HTML parse mode (also inside attribute values such as href). */
export function tgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
