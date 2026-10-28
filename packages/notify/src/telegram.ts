/**
 * Telegram Bot API client (M27): plain `fetch` against `${apiBase}/bot<token>/<method>` (tests point
 * `apiBase` at a local mock). Outgoing messages are spaced to stay under Telegram's limits: about
 * 30 messages per second overall (we use 25) and one per second per chat.
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
  let nextGlobal = 0;
  const nextByChat = new Map<string, number>();

  /** Reserves the next slot for a chat (synchronous bookkeeping, then the caller waits). */
  function reserve(chatId: string): number {
    const now = Date.now();
    const at = Math.max(now, nextGlobal, nextByChat.get(chatId) ?? 0);
    nextGlobal = at + globalGap;
    nextByChat.set(chatId, at + chatGap);
    if (nextByChat.size > 10_000) for (const [k, v] of nextByChat) if (v < now) nextByChat.delete(k);
    return at - now;
  }

  async function call<T>(method: string, params: Record<string, unknown>, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
    const res = await doFetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } } | null;
    if (!body?.ok) throw new TelegramApiError(method, body?.error_code ?? res.status, body?.description ?? res.statusText, body?.parameters?.retry_after);
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

/** Escapes text for Telegram's HTML parse mode. */
export function tgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
