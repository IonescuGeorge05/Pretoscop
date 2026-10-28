import { auditLog, eq, merchants, MERCHANT_FEED_PARSERS, sql, type MerchantFeedFormat } from '@pretoscop/db';
import { createBlobStore } from '@pretoscop/storage';
import { getSession } from '@/lib/auth';
import { readBodyCapped } from '@/lib/body';
import { db, serverEnv } from '@/lib/db';
import {
  CHECK_COOLDOWN_SECONDS,
  enqueueCheck,
  merchantOf,
  overDailyLimit,
  PORTAL_LOGIN_PATH,
  PORTAL_PATH,
  runSourceNow,
  secondsSince,
  setMerchantFeedFreshness,
} from '@/lib/merchant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORMATS = new Set<MerchantFeedFormat>(['google', 'compari', 'csv']);
/** Room for the multipart envelope and the other form fields around the file. */
const ENVELOPE_BYTES = 64 * 1024;

function to(path: string): Response {
  return new Response(null, { status: 303, headers: { location: path, 'cache-control': 'no-store' } });
}
const fail = (code: string) => to(`${PORTAL_PATH}?eroare=${code}#pas-3`);

function looksLikeFeed(bytes: Uint8Array): boolean {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return true; // gzip
  const head = Buffer.from(bytes.subarray(0, 512)).toString('utf8');
  return !head.includes('\u0000');
}

/**
 * POST /api/merchant/feed-upload (multipart: `feed` file, `feedFormat`): stores a feed file the
 * merchant uploaded (XML, CSV, optionally gzipped; at most FETCH_MAX_BODY_BYTES, also after the
 * worker unzips it) in the blob store, deletes the file it replaces and queues its check. At most
 * one upload a minute and ten a day per merchant. Uploaded files are read once per upload: prices
 * go stale until the next one.
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return fail('fisier');
  const session = await getSession();
  if (!session?.user) return to(PORTAL_LOGIN_PATH);
  const m = await merchantOf(session.user.id);
  if (!m) return to(`${PORTAL_PATH}?eroare=site#pas-1`);
  if (m.status === 'pending') return to(`${PORTAL_PATH}?eroare=stare#pas-3`);
  if (secondsSince(m.feedUploadedAt) < CHECK_COOLDOWN_SECONDS.upload || secondsSince(m.validation?.requestedAt) < CHECK_COOLDOWN_SECONDS.validate) {
    return fail('asteapta');
  }
  if ((await overDailyLimit(m.id, 'uploads')) || (await overDailyLimit(m.id, 'feedChecks'))) return fail('limita');

  const env = serverEnv();
  const max = env.FETCH_MAX_BODY_BYTES;
  if (Number(req.headers.get('content-length') ?? 0) > max + ENVELOPE_BYTES) return fail('fisier_mare');
  const raw = await readBodyCapped(req.body, max + ENVELOPE_BYTES);
  if (!raw) return fail('fisier_mare');
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
  } catch {
    return fail('fisier');
  }
  const file = form.get('feed');
  if (!(file instanceof File) || file.size === 0) return fail('fisier');
  if (file.size > max) return fail('fisier_mare');
  const ext = /\.(xml|csv|txt|tsv|gz)$/i.exec(file.name)?.[1]?.toLowerCase() ?? 'txt';
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeFeed(bytes)) return fail('fisier');

  const formatRaw = String(form.get('feedFormat') ?? 'auto');
  const feedFormat = FORMATS.has(formatRaw as MerchantFeedFormat) ? (formatRaw as MerchantFeedFormat) : null;
  const uploadedAt = new Date();
  const key = `merchant-feeds/${m.id}/${uploadedAt.getTime()}.${ext}`;
  const blob = createBlobStore(env);
  await blob.put(key, bytes, ext === 'gz' ? 'application/gzip' : 'text/plain; charset=utf-8');
  await db()
    .update(merchants)
    .set({ feedUploadKey: key, feedUploadedAt: uploadedAt, feedUrl: null, feedFormat })
    .where(eq(merchants.id, m.id));

  if (m.status === 'approved' || m.status === 'suspended') {
    const res = await db().execute<{ id: string; key: string; slug: string }>(sql`
      UPDATE shop_sources s SET url = ${`upload:${key}`}, schedule = NULL,
        ${feedFormat ? sql`parser_key = ${MERCHANT_FEED_PARSERS[feedFormat]}, format = ${feedFormat},` : sql``}
        config = s.config || ${JSON.stringify({ uploadedAt: uploadedAt.toISOString() })}::jsonb, updated_at = now()
      FROM shops p
      WHERE p.id = s.shop_id AND s.config->>'origin' = 'merchant' AND (s.config->>'merchantId')::bigint = ${m.id}
      RETURNING s.id::text, s.key, p.slug`);
    await setMerchantFeedFreshness(m, 'upload');
    const src = res.rows[0];
    if (src && m.status === 'approved') await runSourceNow(Number(src.id), src.key, src.slug);
  }
  // The replaced file is no longer referenced (the live source now points at the new one).
  if (m.feedUploadKey && m.feedUploadKey !== key) await blob.delete(m.feedUploadKey).catch(() => undefined);
  await db()
    .insert(auditLog)
    .values({ actor: `merchant:${session.user.id}`, action: 'merchant.feed_upload', entity: 'merchants', entityId: String(m.id), before: null, after: { key, size: file.size } });
  await enqueueCheck('validate', m.id);
  return to(`${PORTAL_PATH}?ok=fisier#pas-3`);
}
