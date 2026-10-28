/**
 * Prints a new VAPID key pair for Web Push (M27). Put both lines in the server `.env` (never in
 * git); keep them: changing the key pair invalidates every browser subscription.
 *   pnpm --filter @pretoscop/notify vapid:keys
 */
import { generateVapidKeys } from '../push';

const k = generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
