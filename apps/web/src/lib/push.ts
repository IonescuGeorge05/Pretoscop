import 'server-only';
import { isFlagEnabled } from '@pretoscop/db';
import { createPushSender, parsePushSubscription, type PushSender, type PushSubscriptionKeys } from '@pretoscop/notify';
import { db, serverEnv } from './db';

/** Feature flag for alerts as browser notifications (M27). */
export const PUSH_FLAG = 'alerts.push.enabled';

/** A local mock push service (http://127.0.0.1) only in dev and test, never in staging or production. */
function allowLocal(): boolean {
  const env = serverEnv().APP_ENV;
  return env === 'dev' || env === 'test';
}

/** The VAPID public key when Web Push is configured and switched on, else null. */
export async function pushPublicKey(): Promise<string | null> {
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return (await isFlagEnabled(db(), PUSH_FLAG).catch(() => false)) ? env.VAPID_PUBLIC_KEY : null;
}

export function pushSender(): PushSender | null {
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return createPushSender({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT, allowLocalEndpoints: allowLocal() });
}

/** A browser's `PushSubscription.toJSON()`, checked (`parsePushSubscription`: endpoint on a known push service, key sizes). */
export function parseSubscription(raw: unknown): PushSubscriptionKeys | null {
  return parsePushSubscription(raw, { allowLocal: allowLocal() });
}

export { deviceLabel } from './device-label';
