'use client';

import { useSyncExternalStore } from 'react';
import { formatDateTime, formatRelative } from '@/lib/format';

const MINUTE = 60_000;
const subscribe = (tick: () => void) => {
  const t = setInterval(tick, MINUTE);
  return () => clearInterval(t);
};
const currentMinute = () => Math.floor(Date.now() / MINUTE);
const noMinute = () => null;

/**
 * "acum 3 ore" computed in the browser. Cached pages render the absolute time first (server
 * snapshot), so the server HTML never disagrees with the client clock during hydration.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={className}>
      {minute === null ? formatDateTime(iso) : formatRelative(iso, new Date(minute * MINUTE))}
    </time>
  );
}
