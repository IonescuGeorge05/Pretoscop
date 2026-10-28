import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Test helpers for Web Push (M27), written independently of `web-push` from RFC 8291 (message
 * encryption), RFC 8188 (aes128gcm) and RFC 8292 (VAPID), so the tests check the library's output
 * instead of trusting it: a browser-side key pair, a decryptor and a mock push service.
 */
export interface FakeBrowserSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The browser's private key (never leaves the test). */
  privateKey: Buffer;
}

export function fakeBrowserKeys(endpoint: string): FakeBrowserSubscription {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  return { endpoint, p256dh: publicKey.toString('base64url'), auth: randomBytes(16).toString('base64url'), privateKey: ecdh.getPrivateKey() };
}

/** Decrypts an aes128gcm push message body (one record) for the fake browser. */
export function decryptPushBody(body: Buffer, sub: FakeBrowserSubscription): string {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20]!;
  const serverPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  if (record.length > rs) throw new Error('more than one record');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(sub.privateKey);
  const secret = ecdh.computeSecret(serverPublic);
  const uaPublic = Buffer.from(sub.p256dh, 'base64url');
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, Buffer.from(sub.auth, 'base64url'), keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('missing last-record delimiter');
  return plain.subarray(0, end).toString('utf8');
}

/** Checks `Authorization: vapid t=<jwt>, k=<key>`: ES256 signature, audience, expiry, subject. */
export function verifyVapid(authorization: string | undefined, audience: string, expectedPublicKey: string): { sub: string } {
  const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(authorization ?? '');
  if (!m) throw new Error(`bad Authorization header: ${authorization}`);
  const [, jwt, k] = m;
  if (k !== expectedPublicKey) throw new Error('VAPID key differs from the configured public key');
  const [h, p, s] = jwt!.split('.');
  const raw = Buffer.from(k, 'base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') }, format: 'jwk' });
  if (!verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))) throw new Error('bad VAPID signature');
  const header = JSON.parse(Buffer.from(h!, 'base64url').toString()) as { alg: string };
  const claims = JSON.parse(Buffer.from(p!, 'base64url').toString()) as { aud: string; exp: number; sub: string };
  if (header.alg !== 'ES256') throw new Error('VAPID alg must be ES256');
  if (claims.aud !== audience) throw new Error(`VAPID aud ${claims.aud} ≠ ${audience}`);
  const now = Math.floor(Date.now() / 1000);
  if (!(claims.exp > now && claims.exp <= now + 24 * 3600)) throw new Error('VAPID exp outside (now, now + 24 h]');
  if (!/^(mailto:|https:)/.test(claims.sub)) throw new Error('VAPID sub must be mailto: or https:');
  return { sub: claims.sub };
}

export interface ReceivedPush {
  path: string;
  headers: IncomingMessage['headers'];
  payload: Record<string, unknown>;
}

export interface MockPushService {
  url: string;
  received: ReceivedPush[];
  /** Answer the next requests to `path` with this status (e.g. 410 Gone). */
  failNext(path: string, status: number): void;
  close(): Promise<void>;
}

/**
 * A local push service: accepts POSTs, verifies VAPID and decrypts each message with the fake
 * browser registered for its path.
 */
export async function startMockPushService(opts: { vapidPublicKey: string; browsers: Map<string, FakeBrowserSubscription> }): Promise<MockPushService> {
  const received: ReceivedPush[] = [];
  const failures = new Map<string, number>();
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = req.url ?? '/';
      try {
        const fail = failures.get(path);
        if (fail) {
          failures.delete(path);
          res.writeHead(fail).end();
          return;
        }
        const browser = opts.browsers.get(path);
        if (!browser) {
          res.writeHead(404).end();
          return;
        }
        const origin = `http://${req.headers.host}`;
        verifyVapid(req.headers.authorization, origin, opts.vapidPublicKey);
        if (req.headers['content-encoding'] !== 'aes128gcm') throw new Error('content-encoding must be aes128gcm');
        if (!req.headers.ttl) throw new Error('TTL header missing');
        const payload = JSON.parse(decryptPushBody(Buffer.concat(chunks), browser)) as Record<string, unknown>;
        received.push({ path, headers: req.headers, payload });
        res.writeHead(201).end();
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end((err as Error).message);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    failNext: (path, status) => failures.set(path, status),
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export interface MockTelegramCall {
  method: string;
  body: Record<string, unknown>;
}

export interface SentTelegramMessage {
  chat_id: unknown;
  text: string;
  reply_markup?: { inline_keyboard: Array<Array<Record<string, string>>> };
}

export interface MockTelegram {
  /** Base URL to use as TELEGRAM_API_BASE. */
  apiBase: string;
  token: string;
  calls: MockTelegramCall[];
  /** Messages sent with sendMessage, in order. */
  sent(): SentTelegramMessage[];
  /** Queues an update for the next getUpdates. */
  push(update: Record<string, unknown>): void;
  /** Chats that blocked the bot (sendMessage answers 403). */
  blocked: Set<number | string>;
  /** Answer the next sendMessage with 429 and this retry_after. */
  rateLimitNext(retryAfterSec: number): void;
  close(): Promise<void>;
}

/** A local stand-in for api.telegram.org: records calls, serves queued updates, simulates 403/429. */
export async function startMockTelegram(token = '123456:TEST-token'): Promise<MockTelegram> {
  const calls: MockTelegramCall[] = [];
  const queue: Array<Record<string, unknown>> = [];
  const blocked = new Set<number | string>();
  let rateLimit: number | null = null;
  let messageId = 100;
  let nextUpdateId = 1;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');
      const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      if (!m || m[1] !== token) return send(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      const method = m[2]!;
      const body = (chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}) as Record<string, unknown>;
      calls.push({ method, body });
      switch (method) {
        case 'getMe':
          return send(200, { ok: true, result: { id: 42, is_bot: true, first_name: 'Pretoscop', username: 'PretoscopTestBot' } });
        case 'deleteWebhook':
        case 'answerCallbackQuery':
          return send(200, { ok: true, result: true });
        case 'getUpdates': {
          const offset = Number(body.offset ?? 0);
          const ready = queue.filter((u) => Number(u.update_id) >= offset);
          queue.splice(0, queue.length, ...ready);
          return send(200, { ok: true, result: ready });
        }
        case 'sendMessage': {
          if (rateLimit !== null) {
            const retry = rateLimit;
            rateLimit = null;
            return send(429, { ok: false, error_code: 429, description: `Too Many Requests: retry after ${retry}`, parameters: { retry_after: retry } });
          }
          if (blocked.has(body.chat_id as number)) return send(403, { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' });
          return send(200, { ok: true, result: { message_id: ++messageId, chat: { id: body.chat_id, type: 'private' }, text: body.text } });
        }
        default:
          return send(404, { ok: false, error_code: 404, description: 'Not Found' });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    apiBase: `http://127.0.0.1:${port}`,
    token,
    calls,
    sent: () => calls.filter((c) => c.method === 'sendMessage').map((c) => c.body as unknown as SentTelegramMessage),
    push: (update) => {
      queue.push({ update_id: nextUpdateId++, ...update });
    },
    blocked,
    rateLimitNext: (s) => {
      rateLimit = s;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
