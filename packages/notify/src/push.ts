import { createHash } from 'node:crypto';
import webpush from 'web-push';

/**
 * Web Push (M27): the request is built by `web-push` (RFC 8291 aes128gcm payload encryption and the
 * RFC 8292 VAPID JWT, the library every browser vendor tests against) and sent with `fetch`, so it
 * shares timeouts and logging with the rest of the code and tests can point a subscription at a
 * local mock push service.
 *
 * A subscription's endpoint is a URL the browser hands us, so it is untrusted input: it must be an
 * https URL on a known push service (`pushEndpointProblem`), checked when it is stored and again
 * before every request, and requests never follow redirects. Without that, a logged-in visitor
 * could make the server POST to any address (SSRF).
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
  /**
   * Also accept `http://127.0.0.1` / `http://localhost` endpoints (a local mock push service in
   * development and tests). Never in staging or production.
   */
  allowLocalEndpoints?: boolean;
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
  /** `gone`: the subscription expired, was revoked (404/410) or can never work: delete it. */
  | { ok: false; gone: boolean; status: number; error: string; retryAfterSec?: number };

export interface PushSendOptions {
  ttlSec?: number;
  urgency?: 'low' | 'normal' | 'high';
  /**
   * Push services keep at most one undelivered message per topic: a retry with the same topic
   * replaces the first copy instead of arriving twice (`pushTopic(idempotencyKey)`).
   */
  topic?: string;
}

export interface PushSender {
  publicKey: string;
  send(sub: PushSubscriptionKeys, payload: PushPayload, opts?: PushSendOptions): Promise<PushResult>;
}

/**
 * Push services of the browsers we support (endpoint host, exact or as a parent domain): Chrome,
 * Edge's Chromium push for Android, Opera, Samsung Internet and Brave (Firebase Cloud Messaging),
 * Firefox (Mozilla autopush), Safari on macOS and iOS 16.4+ (Apple), Edge on Windows (WNS).
 * A browser with another service cannot subscribe; add its host here after checking it.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

/** Longest endpoint we store (real ones are 150–500 characters). */
export const MAX_ENDPOINT_LENGTH = 1024;

const hostAllowed = (host: string) => PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * Why an endpoint is refused, or null when it may be used: an https URL without credentials or a
 * custom port on a known push service (or, with `allowLocal`, plain http on this machine).
 */
export function pushEndpointProblem(endpoint: string, opts: { allowLocal?: boolean } = {}): string | null {
  if (typeof endpoint !== 'string' || endpoint.length === 0) return 'missing';
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return 'too_long';
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'not_a_url';
  }
  if (url.username || url.password) return 'credentials';
  const host = url.hostname.toLowerCase();
  if (opts.allowLocal && url.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost')) return null;
  if (url.protocol !== 'https:') return 'not_https';
  if (url.port !== '') return 'port';
  if (!hostAllowed(host)) return 'unknown_push_service';
  return null;
}

/**
 * A browser's `PushSubscription.toJSON()` (`{ endpoint, keys: { p256dh, auth } }`), checked: the
 * endpoint (`pushEndpointProblem`), a P-256 public key (65 bytes, uncompressed) and a 16-byte
 * authentication secret, both base64url. Null when anything is off.
 */
export function parsePushSubscription(raw: unknown, opts: { allowLocal?: boolean } = {}): PushSubscriptionKeys | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as { endpoint?: unknown; keys?: unknown };
  if (typeof s.endpoint !== 'string' || pushEndpointProblem(s.endpoint, opts) !== null) return null;
  if (!s.keys || typeof s.keys !== 'object') return null;
  const keys = s.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  // Unpadded base64url, as the Push API specifies (some browsers add '=' padding: dropped).
  const p256dh = keys.p256dh.replace(/=+$/, '');
  const auth = keys.auth.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,30}$/.test(auth)) return null;
  const key = Buffer.from(p256dh, 'base64url');
  if (key.length !== 65 || key[0] !== 0x04 || Buffer.from(auth, 'base64url').length !== 16) return null;
  return { endpoint: s.endpoint, p256dh, auth };
}

/** The Topic header for a message: 32 base64url characters derived from its idempotency key. */
export function pushTopic(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('base64url').slice(0, 32);
}

/** Push services accept about 4 KB of encrypted payload; ours stay far below. */
const MAX_PAYLOAD_BYTES = 3000;

export function createPushSender(cfg: PushConfig): PushSender {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    publicKey: cfg.publicKey,
    async send(sub, payload, opts = {}) {
      const problem = pushEndpointProblem(sub.endpoint, { allowLocal: cfg.allowLocalEndpoints });
      // An endpoint we would refuse today can never be used: report it gone so it is deleted.
      if (problem) return { ok: false, gone: true, status: 0, error: `endpoint refused: ${problem}` };
      const body = JSON.stringify({ title: payload.title.slice(0, 120), body: payload.body.slice(0, 600), url: payload.url, tag: payload.tag });
      if (Buffer.byteLength(body) > MAX_PAYLOAD_BYTES) return { ok: false, gone: false, status: 0, error: 'payload too large' };
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
          redirect: 'error',
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
        });
        if (res.status >= 200 && res.status < 300) {
          await res.body?.cancel().catch(() => undefined);
          return { ok: true, status: res.status };
        }
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
