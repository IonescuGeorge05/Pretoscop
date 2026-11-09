import 'server-only';
import { bearerToken, effectiveLimits, type B2bPlanLimits } from '@pretoscop/core';
import { consumeB2bApiQuota, isFlagEnabled, touchB2bApiKey, verifyB2bApiKey, type B2bApiPrincipal } from '@pretoscop/db';
import type { z } from 'zod';
import { nextBucharestMidnight } from './b2b-api-format';
import type { ErrorBody } from './b2b-api-schema';
import { db, serverEnv } from './db';
import { createRateLimiter, type RateLimiter } from './rate-limit';

/**
 * Gate of every `/api/v1/b2b/*` call (M28): service switch, API key (hashed at rest, compared in
 * constant time), workspace state and terms, the plan's API access, a per-key burst limit and the
 * workspace's daily quota (atomic in PostgreSQL, so concurrent requests never pass it). Keys only:
 * no cookies, so no CSRF surface. Nothing about the caller (IP, User-Agent) is stored.
 */

type ErrorCode = z.infer<typeof ErrorBody>['error']['code'];

const BASE_HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' };

export function apiError(status: number, code: ErrorCode, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function apiJson(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export { nextBucharestMidnight };

const limiters = new Map<number, RateLimiter>();
function limiterFor(perMinute: number): RateLimiter {
  let l = limiters.get(perMinute);
  if (!l) {
    l = createRateLimiter({ limit: perMinute, windowMs: 60_000, maxKeys: 10_000 });
    limiters.set(perMinute, l);
  }
  return l;
}

export interface B2bApiContext {
  principal: B2bApiPrincipal;
  workspaceId: number;
  limits: B2bPlanLimits;
  baseUrl: string;
  /** Quota headers to send with the answer. */
  headers: Record<string, string>;
}

export async function withB2bApi(req: Request, handler: (ctx: B2bApiContext) => Promise<Response>): Promise<Response> {
  const d = db();
  if (!(await isFlagEnabled(d, 'b2b.enabled'))) return apiError(503, 'unavailable', 'The B2B API is not available.');
  const principal = await verifyB2bApiKey(d, bearerToken(req.headers.get('authorization')));
  if (!principal) return apiError(401, 'unauthorized', 'Missing or invalid API key.', { 'www-authenticate': 'Bearer realm="pretoscop-b2b"' });
  if (principal.status !== 'active') return apiError(403, 'workspace_inactive', 'The workspace is not active.');
  if (!principal.termsAccepted) return apiError(403, 'terms_not_accepted', 'The workspace owner must accept the B2B terms first.');
  const limits = effectiveLimits(principal.plan, { skuLimit: principal.skuLimit, apiDailyQuota: principal.apiDailyQuota });
  if (limits.apiDailyQuota <= 0 || limits.apiPerMinute <= 0) return apiError(403, 'plan_without_api', 'Your plan does not include API access.');
  const burst = limiterFor(limits.apiPerMinute).hit(`key:${principal.keyId}`);
  if (!burst.allowed) return apiError(429, 'rate_limited', `At most ${limits.apiPerMinute} requests per minute per key.`, { 'retry-after': String(burst.retryAfterSec) });
  const quota = await consumeB2bApiQuota(d, principal.workspaceId, limits.apiDailyQuota);
  const reset = nextBucharestMidnight();
  const headers = {
    'x-ratelimit-limit': String(quota.limit),
    'x-ratelimit-remaining': String(Math.max(0, quota.limit - quota.used)),
    'x-ratelimit-reset': String(Math.ceil(reset.getTime() / 1000)),
  };
  if (!quota.allowed) {
    return apiError(429, 'quota_exceeded', `Daily quota of ${quota.limit} requests used; it starts over at midnight (Europe/Bucharest).`, {
      ...headers,
      'retry-after': String(Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))),
    });
  }
  await touchB2bApiKey(d, principal.keyId).catch(() => undefined);
  return handler({ principal, workspaceId: principal.workspaceId, limits, baseUrl: serverEnv().PUBLIC_BASE_URL, headers });
}

/** `limit`/`offset` query parameters within bounds (null: invalid). */
export function pageParams(url: URL, maxLimit = 500, defLimit = 100): { limit: number; offset: number } | null {
  const l = url.searchParams.get('limit');
  const o = url.searchParams.get('offset');
  const limit = l === null ? defLimit : Number(l);
  const offset = o === null ? 0 : Number(o);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return null;
  return { limit, offset };
}
