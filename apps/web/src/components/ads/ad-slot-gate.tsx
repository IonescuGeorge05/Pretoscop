import { isFlagEnabled } from '@pretoscop/db';
import { db } from '@/lib/db';
import { adsBuildEnabled } from '@/lib/csp';
import { AdSlot } from './ad-slot';

// Inlined at build time: the same value next.config.ts used for the CSP.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || null;
const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT || null;

/**
 * Server gate of the optional ad slot (M25): renders it only in a build whose CSP lets the ad
 * origins in (NEXT_PUBLIC_ADSENSE_CLIENT) and while the flag `ads.slots.enabled` is on. Never inside
 * the offers table or the "Promovat" slot.
 */
export async function AdSlotGate({ placement }: { placement: 'product' | 'category' }) {
  if (!adsBuildEnabled(ADSENSE_CLIENT)) return null;
  if (!(await isFlagEnabled(db(), 'ads.slots.enabled'))) return null;
  return <AdSlot client={ADSENSE_CLIENT!} slot={ADSENSE_SLOT} placement={placement} />;
}
