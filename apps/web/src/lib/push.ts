import 'server-only';
import { isFlagEnabled } from '@pretoscop/db';
import { createPushSender, type PushSender } from '@pretoscop/notify';
import { db, serverEnv } from './db';

/** Feature flag for alerts as browser notifications (M27). */
export const PUSH_FLAG = 'alerts.push.enabled';

/** The VAPID public key when Web Push is configured and switched on, else null. */
export async function pushPublicKey(): Promise<string | null> {
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return (await isFlagEnabled(db(), PUSH_FLAG).catch(() => false)) ? env.VAPID_PUBLIC_KEY : null;
}

export function pushSender(): PushSender | null {
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return createPushSender({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
}

export interface ParsedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * A browser `PushSubscription.toJSON()`: an https endpoint of a push service (plain http only on
 * this machine, for the local mock in tests), a P-256 public key (65 bytes) and a 16-byte secret.
 */
export function parseSubscription(raw: unknown, allowLocalHttp: boolean): ParsedSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(s.endpoint);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!(url.protocol === 'https:' || (allowLocalHttp && local && url.protocol === 'http:'))) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return null;
  if (Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length !== 16) return null;
  return { endpoint: s.endpoint, p256dh, auth };
}

/** "Chrome · Android" from the User-Agent (only this label is stored, never the User-Agent). */
export function deviceLabel(ua: string | null): string {
  const u = ua ?? '';
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'alt sistem';
  return `${browser} · ${os}`;
}
