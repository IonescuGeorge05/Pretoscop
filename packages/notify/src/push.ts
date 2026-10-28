import webpush from 'web-push';

/**
 * Web Push (M27): the request is built by `web-push` (RFC 8291 aes128gcm payload encryption and the
 * RFC 8292 VAPID JWT, the library every browser vendor tests against) and sent with `fetch`, so it
 * shares timeouts and logging with the rest of the code and tests can point a subscription at a
 * local mock push service.
 */
export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or `https:` contact for push services (VAPID `sub`). */
  subject: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
  /** Notifications with the same tag replace each other (one per product). */
  tag?: string;
}

export type PushResult =
  | { ok: true; status: number }
  /** `gone`: the subscription expired or was revoked (404/410): delete it. */
  | { ok: false; gone: boolean; status: number; error: string; retryAfterSec?: number };

export interface PushSender {
  publicKey: string;
  send(sub: PushSubscriptionKeys, payload: PushPayload, opts?: { ttlSec?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string }): Promise<PushResult>;
}

/** Push service limits a payload to about 4 KB; ours stay far below. */
const MAX_PAYLOAD = 3000;

export function createPushSender(cfg: PushConfig): PushSender {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    publicKey: cfg.publicKey,
    async send(sub, payload, opts = {}) {
      const body = JSON.stringify({ title: payload.title, body: payload.body.slice(0, 600), url: payload.url, tag: payload.tag });
      if (body.length > MAX_PAYLOAD) return { ok: false, gone: false, status: 0, error: 'payload too large' };
      let details: { endpoint: string; method: string; headers: Record<string, string | number>; body: Buffer | null };
      try {
        details = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
          TTL: opts.ttlSec ?? 24 * 3600,
          urgency: opts.urgency ?? 'normal',
          ...(opts.topic ? { topic: opts.topic } : {}),
        }) as unknown as typeof details;
      } catch (err) {
        // Malformed keys of this subscription: it can never work.
        return { ok: false, gone: true, status: 0, error: (err as Error).message.slice(0, 200) };
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(details.headers)) headers[k] = String(v);
      try {
        const res = await doFetch(details.endpoint, {
          method: details.method,
          headers,
          body: details.body ? new Uint8Array(details.body) : undefined,
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
        });
        if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
        const text = (await res.text().catch(() => '')).slice(0, 200);
        const retryAfter = Number(res.headers.get('retry-after'));
        return {
          ok: false,
          gone: res.status === 404 || res.status === 410,
          status: res.status,
          error: `push service ${res.status}${text ? `: ${text}` : ''}`,
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : {}),
        };
      } catch (err) {
        return { ok: false, gone: false, status: 0, error: (err as Error).message.slice(0, 200) };
      }
    },
  };
}

/** A new VAPID key pair (base64url): `pnpm --filter @pretoscop/notify vapid:keys`. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
