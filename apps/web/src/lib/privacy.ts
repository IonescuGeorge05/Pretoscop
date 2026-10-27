import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { getEnv } from '@pretoscop/config/env';

/**
 * Daily rotating salt derived from HASH_SALT_SECRET (CLAUDE.md: hash IPs/UAs with a rotating salt).
 * Hashes from different days cannot be linked; no raw IP or User-Agent is stored anywhere.
 */
export function dailySalt(day = new Date().toISOString().slice(0, 10)): string {
  return createHmac('sha256', getEnv().HASH_SALT_SECRET).update(`salt:${day}`).digest('hex');
}

export function hashWithDailySalt(...parts: Array<string | null | undefined>): string {
  return createHash('sha256').update(dailySalt()).update(parts.map((p) => p ?? '').join('\u0000')).digest('hex').slice(0, 32);
}

/** Client IP from the proxy headers (Cloudflare first). */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0'
  );
}
