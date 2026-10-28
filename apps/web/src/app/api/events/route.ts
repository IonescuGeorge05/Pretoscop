import { events } from '@pretoscop/db';
import { db, serverEnv } from '@/lib/db';
import { clientIp, hashWithDailySalt, isBot } from '@/lib/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4096;
const NAME_RE = /^[a-z][a-z0-9_.:-]{1,63}$/;
const ALLOWED_PROP = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

// Simple per-process rate limit: 120 events per minute per session hash.
const buckets = new Map<string, { count: number; reset: number }>();
function allow(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    if (buckets.size > 50_000) buckets.clear();
    return true;
  }
  b.count++;
  return b.count <= 120;
}

/** POST /api/events — { name, props?, path?, referrer? } → 204. No cookies are read or set. */
export async function POST(req: Request): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BYTES) return new Response('payload too large', { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  if (!body || typeof body !== 'object') return new Response('invalid body', { status: 400 });
  const { name, props, path, referrer } = body as Record<string, unknown>;
  if (typeof name !== 'string' || !NAME_RE.test(name)) return new Response('invalid name', { status: 400 });

  const cleanProps: Record<string, string | number | boolean | null> = {};
  if (props && typeof props === 'object') {
    for (const [k, v] of Object.entries(props as Record<string, unknown>).slice(0, 20)) {
      if (!ALLOWED_PROP.test(k)) continue;
      if (typeof v === 'string') cleanProps[k] = v.slice(0, 200);
      else if (typeof v === 'number' || typeof v === 'boolean' || v === null) cleanProps[k] = v;
    }
  }
  let referrerHost: string | null = null;
  if (typeof referrer === 'string') {
    try {
      referrerHost = new URL(referrer).hostname.slice(0, 120);
    } catch {
      referrerHost = null;
    }
  }
  const session = hashWithDailySalt(clientIp(req.headers), req.headers.get('user-agent'));
  if (!allow(session)) return new Response('rate limited', { status: 429 });
  // Crawlers that run JavaScript (and Lighthouse) would inflate popularity; tests store nothing.
  if (!serverEnv().EVENTS_ENABLED || isBot(req.headers.get('user-agent'))) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

  await db()
    .insert(events)
    .values({
      name,
      props: cleanProps,
      sessionHash: session,
      path: typeof path === 'string' ? path.slice(0, 300) : null,
      referrerHost,
    });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
