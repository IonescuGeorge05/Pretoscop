import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  B2B_API_KEY_PREFIX,
  computePosition,
  foldLower,
  formatApiKey,
  parseApiKey,
  skuIdentity,
  type B2bImportLine,
  type B2bPosition,
} from '@pretoscop/core';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric, numericToBani } from '../money';
import type { B2bMatchMethod, B2bMemberRole, B2bPlanDb, B2bSkuStatus, B2bWorkspaceKind, B2bWorkspaceStatus } from '../schema/b2b';
import { bucharestToday } from './rollup';

/**
 * B2B price intelligence (M28): every statement on the `b2b_*` tables and every read the B2B
 * product makes. Rules enforced here (tests in packages/db/test/b2b.test.ts):
 * - Tenancy: every function that reads or changes customer data takes the workspace id and puts it
 *   in the WHERE clause (a SKU, key or digest of another workspace is "not found").
 * - Icecat exclusion (ADR-016, ADR-026): catalogue data comes only from the `b2b_products` view
 *   (no specs, images, attributes); this module never names `product_specs`, `product_images` or
 *   the `products` table.
 * - No consumer personal data: no clicks, alerts, events, sessions or other users' data.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

const intOrNull = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------------------------------------
// Workspaces and members

export interface B2bWorkspace {
  id: number;
  name: string;
  kind: B2bWorkspaceKind;
  shopId: number | null;
  shopName: string | null;
  brandId: number | null;
  merchantId: number | null;
  plan: B2bPlanDb;
  status: B2bWorkspaceStatus;
  skuLimit: number | null;
  apiDailyQuota: number | null;
  companyName: string | null;
  cui: string | null;
  regCom: string | null;
  billingAddress: string | null;
  billingEmail: string | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  billingProvider: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingStatus: string;
  billingPeriodEnd: string | null;
  statusReason: string | null;
  createdAt: string;
}

const WORKSPACE_COLUMNS = sql.raw(`w.id::text, w.name, w.kind, w.shop_id::text, s.name AS shop_name, w.brand_id::text, w.merchant_id::text, w.plan, w.status,
  w.sku_limit, w.api_daily_quota, w.company_name, w.cui, w.reg_com, w.billing_address, w.billing_email, w.terms_version, w.terms_accepted_at::text,
  w.billing_provider, w.billing_customer_id, w.billing_subscription_id, w.billing_status, w.billing_period_end::text, w.status_reason, w.created_at::text`);

type WorkspaceRow = {
  id: string; name: string; kind: B2bWorkspaceKind; shop_id: string | null; shop_name: string | null; brand_id: string | null; merchant_id: string | null;
  plan: B2bPlanDb; status: B2bWorkspaceStatus; sku_limit: number | null; api_daily_quota: number | null; company_name: string | null; cui: string | null;
  reg_com: string | null; billing_address: string | null; billing_email: string | null; terms_version: string | null; terms_accepted_at: string | null;
  billing_provider: string | null; billing_customer_id: string | null; billing_subscription_id: string | null; billing_status: string;
  billing_period_end: string | null; status_reason: string | null; created_at: string;
};

function toWorkspace(r: WorkspaceRow): B2bWorkspace {
  return {
    id: Number(r.id),
    name: r.name,
    kind: r.kind,
    shopId: intOrNull(r.shop_id),
    shopName: r.shop_name,
    brandId: intOrNull(r.brand_id),
    merchantId: intOrNull(r.merchant_id),
    plan: r.plan,
    status: r.status,
    skuLimit: r.sku_limit,
    apiDailyQuota: r.api_daily_quota,
    companyName: r.company_name,
    cui: r.cui,
    regCom: r.reg_com,
    billingAddress: r.billing_address,
    billingEmail: r.billing_email,
    termsVersion: r.terms_version,
    termsAcceptedAt: r.terms_accepted_at,
    billingProvider: r.billing_provider,
    billingCustomerId: r.billing_customer_id,
    billingSubscriptionId: r.billing_subscription_id,
    billingStatus: r.billing_status,
    billingPeriodEnd: r.billing_period_end,
    statusReason: r.status_reason,
    createdAt: r.created_at,
  };
}

export async function getB2bWorkspace(db: Exec, workspaceId: number): Promise<B2bWorkspace | null> {
  const r = await db.execute<WorkspaceRow>(sql`SELECT ${WORKSPACE_COLUMNS} FROM b2b_workspaces w LEFT JOIN shops s ON s.id = w.shop_id WHERE w.id = ${workspaceId}`);
  return r.rows[0] ? toWorkspace(r.rows[0]) : null;
}

export interface CreateB2bWorkspaceInput {
  name: string;
  kind: B2bWorkspaceKind;
  shopId?: number | null;
  brandId?: number | null;
  merchantId?: number | null;
  plan: B2bPlanDb;
  companyName?: string | null;
  cui?: string | null;
  billingEmail?: string | null;
  createdBy: string;
}

export async function createB2bWorkspace(db: Exec, input: CreateB2bWorkspaceInput): Promise<number> {
  if (input.kind === 'merchant' && !input.shopId) throw new B2bError('shop_required');
  const r = await db.execute<{ id: string }>(sql`
    INSERT INTO b2b_workspaces (name, kind, shop_id, brand_id, merchant_id, plan, company_name, cui, billing_email, created_by)
    VALUES (${input.name}, ${input.kind}, ${input.shopId ?? null}, ${input.brandId ?? null}, ${input.merchantId ?? null}, ${input.plan},
      ${input.companyName ?? null}, ${input.cui ?? null}, ${input.billingEmail ?? null}, ${input.createdBy})
    RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

export interface UpdateB2bWorkspaceInput {
  name?: string;
  plan?: B2bPlanDb;
  status?: B2bWorkspaceStatus;
  statusReason?: string | null;
  shopId?: number | null;
  brandId?: number | null;
  skuLimit?: number | null;
  apiDailyQuota?: number | null;
  companyName?: string | null;
  cui?: string | null;
  regCom?: string | null;
  billingAddress?: string | null;
  billingEmail?: string | null;
}

/** Admin changes (plan, status, limits, shop) and the customer's own billing data. */
export async function updateB2bWorkspace(db: Exec, workspaceId: number, patch: UpdateB2bWorkspaceInput): Promise<void> {
  const cols: Record<keyof UpdateB2bWorkspaceInput, string> = {
    name: 'name', plan: 'plan', status: 'status', statusReason: 'status_reason', shopId: 'shop_id', brandId: 'brand_id', skuLimit: 'sku_limit',
    apiDailyQuota: 'api_daily_quota', companyName: 'company_name', cui: 'cui', regCom: 'reg_com', billingAddress: 'billing_address', billingEmail: 'billing_email',
  };
  const sets: SQL[] = [];
  for (const [k, col] of Object.entries(cols) as Array<[keyof UpdateB2bWorkspaceInput, string]>) {
    if (patch[k] !== undefined) sets.push(sql`${sql.identifier(col)} = ${patch[k]}`);
  }
  if (sets.length === 0) return;
  await db.execute(sql`UPDATE b2b_workspaces SET ${sql.join(sets, sql`, `)}, updated_at = now() WHERE id = ${workspaceId}`);
}

export class B2bError extends Error {
  constructor(public readonly code: 'shop_required' | 'not_found' | 'sku_limit' | 'no_api' | 'last_owner' | 'terms') {
    super(code);
    this.name = 'B2bError';
  }
}

export interface B2bMembership {
  workspaceId: number;
  role: B2bMemberRole;
  digest: boolean;
}

/** The tenant gate: the member's role in this workspace, or null (treat as "not found"). */
export async function b2bMembership(db: Exec, workspaceId: number, userId: string): Promise<B2bMembership | null> {
  const r = await db.execute<{ role: B2bMemberRole; digest: boolean }>(sql`
    SELECT role, digest FROM b2b_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`);
  const m = r.rows[0];
  return m ? { workspaceId, role: m.role, digest: m.digest } : null;
}

export async function b2bWorkspacesForUser(db: Exec, userId: string): Promise<Array<{ id: number; name: string; role: B2bMemberRole; plan: B2bPlanDb; status: B2bWorkspaceStatus }>> {
  const r = await db.execute<{ id: string; name: string; role: B2bMemberRole; plan: B2bPlanDb; status: B2bWorkspaceStatus }>(sql`
    SELECT w.id::text, w.name, m.role, w.plan, w.status FROM b2b_members m JOIN b2b_workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId} ORDER BY w.name, w.id`);
  return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
}

/** Invites an address (lower-cased); an open invitation for it is replaced (new role). */
export async function inviteB2bMember(db: Exec, workspaceId: number, email: string, role: B2bMemberRole, invitedBy: string): Promise<void> {
  const addr = email.trim().toLowerCase();
  await db.execute(sql`DELETE FROM b2b_invites WHERE workspace_id = ${workspaceId} AND email = ${addr} AND accepted_at IS NULL`);
  await db.execute(sql`INSERT INTO b2b_invites (workspace_id, email, role, invited_by) VALUES (${workspaceId}, ${addr}, ${role}, ${invitedBy})`);
}

/**
 * Turns the open invitations of a signed-in address into memberships (the magic link proved the
 * address). An existing membership keeps its role unless the invitation makes it owner.
 */
export async function acceptB2bInvites(db: Db, userId: string, email: string): Promise<number> {
  const addr = email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const inv = await tx.execute<{ id: string; workspace_id: string; role: B2bMemberRole }>(sql`
      UPDATE b2b_invites SET accepted_at = now() WHERE email = ${addr} AND accepted_at IS NULL
      RETURNING id::text, workspace_id::text, role`);
    for (const i of inv.rows) {
      await tx.execute(sql`
        INSERT INTO b2b_members (workspace_id, user_id, role) VALUES (${Number(i.workspace_id)}, ${userId}, ${i.role})
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = CASE WHEN excluded.role = 'owner' THEN 'owner' ELSE b2b_members.role END`);
    }
    return inv.rows.length;
  });
}

export async function listB2bMembers(db: Exec, workspaceId: number): Promise<Array<{ userId: string; email: string; role: B2bMemberRole; digest: boolean; createdAt: string }>> {
  const r = await db.execute<{ user_id: string; email: string; role: B2bMemberRole; digest: boolean; created_at: string }>(sql`
    SELECT m.user_id, u.email, m.role, m.digest, m.created_at::text FROM b2b_members m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} ORDER BY m.role DESC, u.email`);
  return r.rows.map((x) => ({ userId: x.user_id, email: x.email, role: x.role, digest: x.digest, createdAt: x.created_at }));
}

export async function listB2bInvites(db: Exec, workspaceId: number): Promise<Array<{ id: number; email: string; role: B2bMemberRole; createdAt: string }>> {
  const r = await db.execute<{ id: string; email: string; role: B2bMemberRole; created_at: string }>(sql`
    SELECT id::text, email, role, created_at::text FROM b2b_invites WHERE workspace_id = ${workspaceId} AND accepted_at IS NULL ORDER BY created_at`);
  return r.rows.map((x) => ({ id: Number(x.id), email: x.email, role: x.role, createdAt: x.created_at }));
}

export async function cancelB2bInvite(db: Exec, workspaceId: number, inviteId: number): Promise<boolean> {
  const r = await db.execute(sql`DELETE FROM b2b_invites WHERE id = ${inviteId} AND workspace_id = ${workspaceId} AND accepted_at IS NULL`);
  return (r.rowCount ?? 0) > 0;
}

/** Removes a member; the last owner stays (a workspace always has someone who can manage it). */
export async function removeB2bMember(db: Db, workspaceId: number, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('b2b_members'), ${workspaceId}::int)`);
    const m = await tx.execute<{ role: B2bMemberRole; owners: string }>(sql`
      SELECT role, (SELECT count(*) FROM b2b_members WHERE workspace_id = ${workspaceId} AND role = 'owner')::text AS owners
      FROM b2b_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`);
    const row = m.rows[0];
    if (!row) return false;
    if (row.role === 'owner' && Number(row.owners) <= 1) throw new B2bError('last_owner');
    await tx.execute(sql`DELETE FROM b2b_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`);
    return true;
  });
}

export async function setB2bDigest(db: Exec, workspaceId: number, userId: string, on: boolean): Promise<void> {
  await db.execute(sql`UPDATE b2b_members SET digest = ${on} WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`);
}

export async function acceptB2bTerms(db: Exec, workspaceId: number, userId: string, version: string): Promise<void> {
  await db.execute(sql`
    UPDATE b2b_workspaces SET terms_version = ${version}, terms_accepted_at = now(), terms_accepted_by = ${userId}, updated_at = now()
    WHERE id = ${workspaceId}`);
}

// ---------------------------------------------------------------------------------------------
// SKU import and resolution

export interface B2bResolution {
  productId: number | null;
  status: B2bSkuStatus;
  method: B2bMatchMethod | null;
}

/** Follows merges to the live product (merged products point at the product they became). */
const LIVE_PRODUCT = sql.raw(`(
  WITH RECURSIVE chain(id, status, merged_into_id, depth) AS (
    SELECT bp.id, bp.status, bp.merged_into_id, 0 FROM b2b_products bp WHERE bp.id = x.product_id
    UNION ALL
    SELECT bp.id, bp.status, bp.merged_into_id, c.depth + 1 FROM chain c JOIN b2b_products bp ON bp.id = c.merged_into_id
    WHERE c.status = 'merged' AND c.depth < 10
  ) SELECT id FROM chain WHERE status = 'active' ORDER BY depth DESC LIMIT 1)`);

/**
 * Resolves import lines to catalogue products in two queries: GTINs through `product_gtins`
 * (validated, never Icecat's, ADR-016), then MPNs among active products (`mpn_norm`), narrowed by
 * the brand when one is given. Exactly one candidate matches; several are `ambiguous` (the
 * customer picks from the catalogue instead); none is `unmatched` and retried nightly.
 */
export async function resolveB2bLines(db: Exec, lines: ReadonlyArray<Pick<B2bImportLine, 'gtin' | 'mpn' | 'brand'>>): Promise<B2bResolution[]> {
  const gtins = [...new Set(lines.map((l) => l.gtin).filter((g): g is string => Boolean(g)))];
  const mpns = [...new Set(lines.map((l) => l.mpn).filter((m): m is string => Boolean(m)))];
  const byGtin = new Map<string, number>();
  if (gtins.length) {
    const r = await db.execute<{ gtin14: string; live: string | null }>(sql`
      SELECT x.gtin14, ${LIVE_PRODUCT}::text AS live
      FROM (SELECT g.gtin14, g.product_id FROM product_gtins g WHERE g.gtin14 = ANY(${sql.param(gtins)}::text[])) x`);
    for (const row of r.rows) if (row.live) byGtin.set(row.gtin14, Number(row.live));
  }
  const byMpn = new Map<string, Array<{ id: number; brand: string | null; aliases: string[] }>>();
  if (mpns.length) {
    const r = await db.execute<{ id: string; mpn_norm: string; brand: string | null; aliases: string[] | null }>(sql`
      SELECT bp.id::text, bp.mpn_norm, bp.brand, b.aliases FROM b2b_products bp LEFT JOIN brands b ON b.id = bp.brand_id
      WHERE bp.status = 'active' AND bp.mpn_norm = ANY(${sql.param(mpns)}::text[])`);
    for (const row of r.rows) {
      const list = byMpn.get(row.mpn_norm) ?? [];
      list.push({ id: Number(row.id), brand: row.brand, aliases: row.aliases ?? [] });
      byMpn.set(row.mpn_norm, list);
    }
  }
  const key = (s: string | null) => foldLower(s ?? '').replace(/[^a-z0-9]/g, '');
  return lines.map((l) => {
    if (l.gtin && byGtin.has(l.gtin)) return { productId: byGtin.get(l.gtin)!, status: 'matched', method: 'gtin' };
    if (!l.mpn) return { productId: null, status: 'unmatched', method: null };
    let cands = byMpn.get(l.mpn) ?? [];
    const brandKey = key(l.brand);
    if (brandKey) cands = cands.filter((c) => key(c.brand) === brandKey || c.aliases.some((a) => key(a) === brandKey));
    if (cands.length === 1) return { productId: cands[0]!.id, status: 'matched', method: brandKey ? 'brand_mpn' : 'mpn' };
    return { productId: null, status: cands.length > 1 ? 'ambiguous' : 'unmatched', method: null };
  });
}

export interface B2bImportResult {
  added: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  /** Lines describing a SKU the workspace already tracks (or repeated in the list). */
  duplicates: number;
  /** Lines with an error (not imported). */
  invalid: number;
  /** Lines left out because the plan's SKU limit was reached. */
  overLimit: number;
}

/**
 * Adds the valid lines as SKUs, up to the workspace's SKU limit, in list order. Under a
 * per-workspace advisory lock, so concurrent imports can never pass the limit together; inserted
 * in batches (one statement per 1,000 lines).
 */
export async function importB2bSkus(db: Db, workspaceId: number, lines: readonly B2bImportLine[], skuLimit: number): Promise<B2bImportResult> {
  const valid = lines.filter((l) => l.errors.length === 0 && (l.gtin || l.mpn));
  const res: B2bImportResult = { added: 0, matched: 0, unmatched: 0, ambiguous: 0, duplicates: 0, invalid: lines.length - valid.length, overLimit: 0 };
  const resolved = await resolveB2bLines(db, valid);
  // One SKU per identity: repeated lines in the list are duplicates.
  const seen = new Set<string>();
  const candidates: Array<{ line: B2bImportLine; r: B2bResolution; identity: string }> = [];
  valid.forEach((line, i) => {
    const r = resolved[i]!;
    const identity = skuIdentity({ productId: r.productId, gtin: line.gtin, mpn: line.mpn, brand: line.brand })!;
    if (seen.has(identity)) res.duplicates++;
    else {
      seen.add(identity);
      candidates.push({ line, r, identity });
    }
  });
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('b2b_skus'), ${workspaceId}::int)`);
    const existing = await tx.execute<{ identity: string }>(sql`SELECT identity FROM b2b_skus WHERE workspace_id = ${workspaceId}`);
    const have = new Set(existing.rows.map((x) => x.identity));
    const room = Math.max(0, skuLimit - have.size);
    const fresh = candidates.filter((c) => {
      if (have.has(c.identity)) {
        res.duplicates++;
        return false;
      }
      return true;
    });
    const take = fresh.slice(0, room);
    res.overLimit = fresh.length - take.length;
    for (let i = 0; i < take.length; i += 1000) {
      const chunk = take.slice(i, i + 1000);
      const col = <T>(f: (c: (typeof chunk)[number]) => T) => sql.param(chunk.map(f));
      const ins = await tx.execute<{ status: B2bSkuStatus }>(sql`
        INSERT INTO b2b_skus (workspace_id, identity, product_id, status, match_method, ref, label, gtin14, mpn_raw, mpn_norm, brand_raw, reference_price, resolved_at)
        SELECT ${workspaceId}, u.identity, u.product_id, u.status, u.method, u.ref, u.label, u.gtin14, u.mpn_raw, u.mpn_norm, u.brand_raw, u.price,
          CASE WHEN u.product_id IS NULL THEN NULL ELSE now() END
        FROM unnest(${col((c) => c.identity)}::text[], ${col((c) => c.r.productId)}::bigint[], ${col((c) => c.r.status)}::text[], ${col((c) => c.r.method)}::text[],
          ${col((c) => c.line.ref)}::text[], ${col((c) => c.line.label)}::text[], ${col((c) => c.line.gtin)}::text[], ${col((c) => c.line.mpnRaw)}::text[],
          ${col((c) => c.line.mpn)}::text[], ${col((c) => c.line.brand)}::text[],
          ${col((c) => (c.line.referencePriceBani === null ? null : baniToNumeric(c.line.referencePriceBani)))}::numeric[])
          AS u(identity, product_id, status, method, ref, label, gtin14, mpn_raw, mpn_norm, brand_raw, price)
        ON CONFLICT DO NOTHING
        RETURNING status`);
      // Nothing else writes this workspace's SKUs while the lock is held; a conflict would be a bug.
      res.duplicates += chunk.length - ins.rows.length;
      for (const row of ins.rows) {
        res.added++;
        res[row.status]++;
      }
    }
    return res;
  });
}

/** "Pick from the catalogue": tracks one product directly (status matched, method catalogue). */
export async function addB2bCatalogueSku(db: Db, workspaceId: number, productId: number, skuLimit: number): Promise<'added' | 'duplicate' | 'limit' | 'not_found'> {
  return db.transaction(async (tx) => {
    const p = await tx.execute<{ id: string }>(sql`SELECT id::text FROM b2b_products WHERE id = ${productId} AND status = 'active'`);
    if (!p.rows[0]) return 'not_found';
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('b2b_skus'), ${workspaceId}::int)`);
    const cnt = await tx.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM b2b_skus WHERE workspace_id = ${workspaceId}`);
    if (Number(cnt.rows[0]!.n) >= skuLimit) return 'limit';
    const gtin = await tx.execute<{ g: string | null }>(sql`SELECT min(gtin14) AS g FROM product_gtins WHERE product_id = ${productId}`);
    const ins = await tx.execute(sql`
      INSERT INTO b2b_skus (workspace_id, identity, product_id, status, match_method, gtin14, resolved_at)
      VALUES (${workspaceId}, ${skuIdentity({ productId })}, ${productId}, 'matched', 'catalogue', ${gtin.rows[0]?.g ?? null}, now())
      ON CONFLICT DO NOTHING`);
    return (ins.rowCount ?? 0) > 0 ? 'added' : 'duplicate';
  });
}

export async function removeB2bSku(db: Exec, workspaceId: number, skuId: number): Promise<boolean> {
  const r = await db.execute(sql`DELETE FROM b2b_skus WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
  return (r.rowCount ?? 0) > 0;
}

export async function updateB2bSku(db: Exec, workspaceId: number, skuId: number, patch: { ref?: string | null; label?: string | null; referencePriceBani?: number | null }): Promise<boolean> {
  const sets: SQL[] = [];
  if (patch.ref !== undefined) sets.push(sql`ref = ${patch.ref}`);
  if (patch.label !== undefined) sets.push(sql`label = ${patch.label}`);
  if (patch.referencePriceBani !== undefined) sets.push(sql`reference_price = ${patch.referencePriceBani === null ? null : baniToNumeric(patch.referencePriceBani)}`);
  if (sets.length === 0) return false;
  const r = await db.execute(sql`UPDATE b2b_skus SET ${sql.join(sets, sql`, `)}, updated_at = now() WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Nightly upkeep (worker `b2b.resolve`): matched SKUs whose product was merged follow it (or
 * fold into the SKU that already tracks it); unmatched and ambiguous SKUs are tried again, since
 * the catalogue grows. `workspaceId` null = every workspace.
 */
export async function reresolveB2bSkus(db: Db, workspaceId: number | null = null): Promise<{ followed: number; folded: number; newlyMatched: number }> {
  const out = { followed: 0, folded: 0, newlyMatched: 0 };
  const wsFilter = workspaceId === null ? sql`` : sql`AND k.workspace_id = ${workspaceId}`;
  // 1. Merged products.
  const merged = await db.execute<{ id: string; workspace_id: string; live: string | null }>(sql`
    SELECT k.id::text, k.workspace_id::text, ${LIVE_PRODUCT}::text AS live
    FROM (SELECT k.id, k.workspace_id, k.product_id FROM b2b_skus k JOIN b2b_products bp ON bp.id = k.product_id WHERE bp.status <> 'active' ${wsFilter}) x
    JOIN b2b_skus k ON k.id = x.id`);
  for (const m of merged.rows) {
    const res = await moveSkuToProduct(db, Number(m.workspace_id), Number(m.id), m.live === null ? null : Number(m.live), null);
    if (res === 'moved') out.followed++;
    else if (res === 'folded') out.folded++;
  }
  // 2. Unmatched and ambiguous SKUs, in pages.
  let after = 0;
  for (;;) {
    const page = await db.execute<{ id: string; workspace_id: string; gtin14: string | null; mpn_norm: string | null; brand_raw: string | null }>(sql`
      SELECT k.id::text, k.workspace_id::text, k.gtin14, k.mpn_norm, k.brand_raw FROM b2b_skus k
      WHERE k.status <> 'matched' AND k.id > ${after} ${wsFilter} ORDER BY k.id LIMIT 1000`);
    if (page.rows.length === 0) break;
    after = Number(page.rows.at(-1)!.id);
    const resolved = await resolveB2bLines(db, page.rows.map((r) => ({ gtin: r.gtin14, mpn: r.mpn_norm, brand: r.brand_raw })));
    for (let i = 0; i < page.rows.length; i++) {
      const r = resolved[i]!;
      const row = page.rows[i]!;
      if (r.status === 'matched') {
        const res = await moveSkuToProduct(db, Number(row.workspace_id), Number(row.id), r.productId, r.method);
        if (res === 'moved') out.newlyMatched++;
        else if (res === 'folded') out.folded++;
      } else {
        await db.execute(sql`UPDATE b2b_skus SET status = ${r.status}, updated_at = now() WHERE id = ${Number(row.id)} AND status <> ${r.status}`);
      }
    }
  }
  return out;
}

/** Points a SKU at a product; when the workspace already tracks that product, the SKU folds into it. */
async function moveSkuToProduct(db: Db, workspaceId: number, skuId: number, productId: number | null, method: B2bMatchMethod | null): Promise<'moved' | 'folded' | 'unmatched'> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('b2b_skus'), ${workspaceId}::int)`);
    if (productId === null) {
      // The product was hidden: the SKU goes back to what the customer gave us.
      const k = await tx.execute<{ gtin14: string | null; mpn_norm: string | null; brand_raw: string | null; identity: string }>(sql`
        SELECT gtin14, mpn_norm, brand_raw, identity FROM b2b_skus WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
      const row = k.rows[0];
      if (!row) return 'unmatched';
      const identity = skuIdentity({ gtin: row.gtin14, mpn: row.mpn_norm, brand: row.brand_raw }) ?? row.identity;
      const clash = await tx.execute(sql`SELECT 1 FROM b2b_skus WHERE workspace_id = ${workspaceId} AND identity = ${identity} AND id <> ${skuId}`);
      if (clash.rows.length > 0) {
        await tx.execute(sql`DELETE FROM b2b_skus WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
        return 'folded';
      }
      await tx.execute(sql`
        UPDATE b2b_skus SET product_id = NULL, status = 'unmatched', match_method = NULL, identity = ${identity}, updated_at = now()
        WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
      return 'unmatched';
    }
    const existing = await tx.execute<{ id: string; ref: string | null; label: string | null; reference_price: string | null }>(sql`
      SELECT id::text, ref, label, reference_price::text FROM b2b_skus WHERE workspace_id = ${workspaceId} AND product_id = ${productId} AND id <> ${skuId}`);
    if (existing.rows[0]) {
      // Keep the customer's code, name and price if the surviving SKU lacks them.
      await tx.execute(sql`
        UPDATE b2b_skus t SET ref = coalesce(t.ref, s.ref), label = coalesce(t.label, s.label), reference_price = coalesce(t.reference_price, s.reference_price), updated_at = now()
        FROM b2b_skus s WHERE t.id = ${Number(existing.rows[0].id)} AND s.id = ${skuId}`);
      await tx.execute(sql`DELETE FROM b2b_skus WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
      return 'folded';
    }
    await tx.execute(sql`
      UPDATE b2b_skus SET product_id = ${productId}, status = 'matched', match_method = coalesce(${method}, match_method),
        identity = ${skuIdentity({ productId })}, resolved_at = now(), updated_at = now()
      WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
    return 'moved';
  });
}

export async function b2bSkuCounts(db: Exec, workspaceId: number): Promise<{ total: number; matched: number; unmatched: number; ambiguous: number }> {
  const r = await db.execute<{ total: string; matched: string; unmatched: string; ambiguous: string }>(sql`
    SELECT count(*)::text AS total, count(*) FILTER (WHERE status = 'matched')::text AS matched,
      count(*) FILTER (WHERE status = 'unmatched')::text AS unmatched, count(*) FILTER (WHERE status = 'ambiguous')::text AS ambiguous
    FROM b2b_skus WHERE workspace_id = ${workspaceId}`);
  const x = r.rows[0]!;
  return { total: Number(x.total), matched: Number(x.matched), unmatched: Number(x.unmatched), ambiguous: Number(x.ambiguous) };
}

/** Catalogue search for "pick from the catalogue" (title words, MPN or GTIN). */
export async function searchB2bCatalogue(db: Exec, q: string, limit = 20): Promise<Array<{ id: number; title: string; brand: string | null; mpn: string | null; slug: string }>> {
  const text = foldLower(q).replace(/[%_\\]/g, ' ').trim();
  if (text.length < 2) return [];
  const words = text.split(/\s+/).filter(Boolean).slice(0, 6);
  const digits = q.replace(/\D/g, '');
  const mpn = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = await db.execute<{ id: string; title: string; brand: string | null; mpn: string | null; slug: string }>(sql`
    SELECT bp.id::text, bp.title, bp.brand, bp.mpn, bp.slug FROM b2b_products bp
    WHERE bp.status = 'active' AND (
      (${sql.join(words.map((w) => sql`bp.title_ascii ILIKE ${`%${w}%`}`), sql` AND `)})
      OR (${mpn.length >= 3} AND bp.mpn_norm = ${mpn})
      OR (${digits.length >= 8} AND bp.id IN (SELECT product_id FROM product_gtins WHERE gtin14 = lpad(${digits}, 14, '0')))
    )
    ORDER BY (bp.mpn_norm = ${mpn}) DESC, length(bp.title), bp.id LIMIT ${Math.min(Math.max(limit, 1), 50)}`);
  return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
}

// ---------------------------------------------------------------------------------------------
// Positions

/** One offer on a tracked product, as the B2B product shows it (no seller or buyer personal data). */
export interface B2bOffer {
  offerId: number;
  shopId: number;
  shopName: string;
  shopSlug: string;
  /** Marketplace seller name when the offer is sold by a third party on a marketplace. */
  sellerName: string | null;
  sellerType: 'shop' | 'marketplace';
  url: string;
  priceBani: number;
  shippingBani: number | null;
  totalBani: number;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  condition: 'new' | 'refurbished' | 'used';
  lastCheckedAt: string;
  /** Older than the shop's freshness SLO (product-page rule). */
  stale: boolean;
  /** Counts for min/median: fresh, in stock, new, not a bundle, no pending quarantine. */
  comparable: boolean;
  own: boolean;
}

export interface B2bPositionRow {
  skuId: number;
  ref: string | null;
  label: string | null;
  gtin: string | null;
  mpn: string | null;
  brandRaw: string | null;
  status: B2bSkuStatus;
  product: { id: number; slug: string; title: string; brand: string | null; category: string | null } | null;
  /** Our live offer (merchant workspaces), the cheapest of the shop's eligible offers. */
  own: B2bOffer | null;
  referencePriceBani: number | null;
  /** The price the position is computed for: our offer's total, else the reference price. */
  ownBasis: 'offer' | 'reference' | null;
  ownTotalBani: number | null;
  position: B2bPosition;
  cheapest: { shopName: string; sellerName: string | null; totalBani: number } | null;
  /** Oldest and newest check among the comparable competitor offers. */
  oldestCheckAt: string | null;
  newestCheckAt: string | null;
  /** Every eligible competitor offer (comparable or not). */
  offers: B2bOffer[];
}

type OfferRow = {
  sku_id: string; offer_id: string; shop_id: string; shop_name: string; shop_slug: string; seller_name: string | null; seller_type: 'shop' | 'marketplace';
  url: string; price: string; shipping_cost: string | null; total: string; availability: B2bOffer['availability']; condition: B2bOffer['condition'];
  last_checked_at: string; stale: boolean; comparable: boolean;
};

/**
 * Same eligibility as the product page (M13): active, matched, active shop, not blacklisted,
 * checked within 30 days. `comparable` adds the rules for min/median (fresh within the shop's SLO,
 * in stock, new, no bundle, no pending quarantine).
 */
async function offersFor(db: Exec, workspaceId: number, skuIds: number[] | null): Promise<OfferRow[]> {
  const filter = skuIds ? sql`AND k.id = ANY(${sql.param(skuIds)}::bigint[])` : sql``;
  const r = await db.execute<OfferRow>(sql`
    SELECT k.id::text AS sku_id, o.id::text AS offer_id, s.id::text AS shop_id, s.name AS shop_name, s.slug AS shop_slug,
      CASE WHEN o.seller_type = 'marketplace' THEN o.seller_name END AS seller_name, o.seller_type, o.url,
      o.price::text, o.shipping_cost::text, o.total_price::text AS total, o.availability, o.condition, o.last_checked_at::text,
      (o.last_checked_at <= now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))) AS stale,
      (o.availability = 'in_stock' AND o.condition = 'new' AND NOT o.is_bundle
        AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
        AND NOT EXISTS (SELECT 1 FROM price_events_quarantine q WHERE q.offer_id = o.id AND q.status = 'pending')) AS comparable
    FROM b2b_skus k
    JOIN offers o ON o.product_id = k.product_id
    JOIN shops s ON s.id = o.shop_id
    WHERE k.workspace_id = ${workspaceId} ${filter}
      AND o.active AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
      AND o.last_checked_at > now() - interval '30 days'
    ORDER BY k.id, o.total_price, o.last_checked_at DESC, o.id`);
  return r.rows;
}

type SkuRow = {
  id: string; ref: string | null; label: string | null; gtin14: string | null; mpn_raw: string | null; brand_raw: string | null; status: B2bSkuStatus;
  reference_price: string | null; product_id: string | null; slug: string | null; title: string | null; brand: string | null; category: string | null;
};

export interface B2bPositionsQuery {
  skuIds?: number[] | null;
  /** Only SKUs in this state. */
  status?: B2bSkuStatus | null;
  limit?: number;
  offset?: number;
}

/**
 * The position table (UI, CSV export and API share it): per SKU our price, the comparable
 * competitors' minimum and median, our rank, every competitor offer with its freshness. SKUs in
 * the workspace's order (customer code, then label, then id).
 */
export async function b2bPositions(db: Exec, workspaceId: number, q: B2bPositionsQuery = {}): Promise<B2bPositionRow[]> {
  const ws = await db.execute<{ shop_id: string | null }>(sql`SELECT shop_id::text FROM b2b_workspaces WHERE id = ${workspaceId}`);
  if (!ws.rows[0]) return [];
  const ownShop = intOrNull(ws.rows[0].shop_id);
  const limit = Math.min(Math.max(q.limit ?? 10_000, 1), 10_000);
  const offset = Math.max(q.offset ?? 0, 0);
  const skus = await db.execute<SkuRow>(sql`
    SELECT k.id::text, k.ref, k.label, k.gtin14, k.mpn_raw, k.brand_raw, k.status, k.reference_price::text,
      bp.id::text AS product_id, bp.slug, bp.title, bp.brand, bp.category
    FROM b2b_skus k LEFT JOIN b2b_products bp ON bp.id = k.product_id
    WHERE k.workspace_id = ${workspaceId}
      ${q.skuIds ? sql`AND k.id = ANY(${sql.param(q.skuIds)}::bigint[])` : sql``}
      ${q.status ? sql`AND k.status = ${q.status}` : sql``}
    ORDER BY k.ref NULLS LAST, coalesce(k.label, bp.title) NULLS LAST, k.id
    LIMIT ${limit} OFFSET ${offset}`);
  if (skus.rows.length === 0) return [];
  const offerRows = await offersFor(db, workspaceId, skus.rows.map((s) => Number(s.id)));
  const bySku = new Map<number, B2bOffer[]>();
  for (const o of offerRows) {
    const offer: B2bOffer = {
      offerId: Number(o.offer_id),
      shopId: Number(o.shop_id),
      shopName: o.shop_name,
      shopSlug: o.shop_slug,
      sellerName: o.seller_name,
      sellerType: o.seller_type,
      url: o.url,
      priceBani: numericToBani(o.price)!,
      shippingBani: numericToBani(o.shipping_cost),
      totalBani: numericToBani(o.total)!,
      availability: o.availability,
      condition: o.condition,
      lastCheckedAt: o.last_checked_at,
      stale: o.stale,
      comparable: o.comparable,
      own: ownShop !== null && Number(o.shop_id) === ownShop,
    };
    const list = bySku.get(Number(o.sku_id)) ?? [];
    list.push(offer);
    bySku.set(Number(o.sku_id), list);
  }
  return skus.rows.map((s) => {
    const all = bySku.get(Number(s.id)) ?? [];
    const ownOffers = all.filter((o) => o.own);
    // Our price: the cheapest comparable own offer, else the cheapest own offer at all.
    const own = ownOffers.find((o) => o.comparable) ?? ownOffers[0] ?? null;
    const competitors = all.filter((o) => !o.own);
    const comparable = competitors.filter((o) => o.comparable);
    const referencePriceBani = numericToBani(s.reference_price);
    const ownTotalBani = own ? own.totalBani : referencePriceBani;
    const ownBasis = own ? 'offer' : referencePriceBani !== null ? 'reference' : null;
    const position = computePosition(ownTotalBani, comparable.map((o) => o.totalBani), competitors.length > 0 || ownOffers.length > 0);
    const cheapestOffer = comparable[0] ?? null;
    const checks = comparable.map((o) => o.lastCheckedAt).sort();
    return {
      skuId: Number(s.id),
      ref: s.ref,
      label: s.label,
      gtin: s.gtin14,
      mpn: s.mpn_raw,
      brandRaw: s.brand_raw,
      status: s.status,
      product: s.product_id ? { id: Number(s.product_id), slug: s.slug!, title: s.title!, brand: s.brand, category: s.category } : null,
      own,
      referencePriceBani,
      ownBasis,
      ownTotalBani,
      position,
      cheapest: cheapestOffer ? { shopName: cheapestOffer.shopName, sellerName: cheapestOffer.sellerName, totalBani: cheapestOffer.totalBani } : null,
      oldestCheckAt: checks[0] ?? null,
      newestCheckAt: checks.at(-1) ?? null,
      offers: competitors,
    };
  });
}

/** One SKU of this workspace (null when it belongs to another workspace or does not exist). */
export async function b2bSkuPosition(db: Exec, workspaceId: number, skuId: number): Promise<B2bPositionRow | null> {
  const rows = await b2bPositions(db, workspaceId, { skuIds: [skuId] });
  return rows[0] ?? null;
}

export async function b2bSkuCount(db: Exec, workspaceId: number, status: B2bSkuStatus | null = null): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM b2b_skus WHERE workspace_id = ${workspaceId} ${status ? sql`AND status = ${status}` : sql``}`);
  return Number(r.rows[0]!.n);
}

/** The catalogue product a SKU of this workspace tracks (for its history chart), else null. */
export async function b2bSkuProductId(db: Exec, workspaceId: number, skuId: number): Promise<number | null> {
  const r = await db.execute<{ product_id: string | null }>(sql`SELECT product_id::text FROM b2b_skus WHERE id = ${skuId} AND workspace_id = ${workspaceId}`);
  return intOrNull(r.rows[0]?.product_id);
}

// ---------------------------------------------------------------------------------------------
// Daily digest

export interface B2bChange {
  skuId: number;
  ref: string | null;
  label: string;
  shopName: string;
  sellerName: string | null;
  own: boolean;
  observedAt: string;
  /** null: the offer was seen for the first time. */
  beforeTotalBani: number | null;
  afterTotalBani: number;
  beforeAvailability: string | null;
  afterAvailability: string;
}

/**
 * What changed on the workspace's tracked products between `from` and `to`: every observed price
 * or availability change (price_events, observations only) of an eligible offer, with the state
 * before it. Newest first, at most `limit`.
 */
export async function b2bChanges(db: Exec, workspaceId: number, from: Date, to: Date, limit = 200): Promise<{ changes: B2bChange[]; total: number }> {
  const ws = await db.execute<{ shop_id: string | null }>(sql`SELECT shop_id::text FROM b2b_workspaces WHERE id = ${workspaceId}`);
  if (!ws.rows[0]) return { changes: [], total: 0 };
  const ownShop = intOrNull(ws.rows[0].shop_id);
  const r = await db.execute<{
    sku_id: string; ref: string | null; label: string; shop_id: string; shop_name: string; seller_name: string | null; observed_at: string;
    after_total: string; after_av: string; before_total: string | null; before_av: string | null; total: string;
  }>(sql`
    WITH ev AS (
      SELECT k.id AS sku_id, k.ref, coalesce(k.label, bp.title) AS label, s.id AS shop_id, s.name AS shop_name,
        CASE WHEN o.seller_type = 'marketplace' THEN o.seller_name END AS seller_name, e.offer_id, e.observed_at,
        e.price + coalesce(e.shipping_cost, 0) AS after_total, e.availability AS after_av
      FROM b2b_skus k
      JOIN b2b_products bp ON bp.id = k.product_id
      JOIN offers o ON o.product_id = k.product_id
      JOIN shops s ON s.id = o.shop_id
      JOIN price_events e ON e.offer_id = o.id
      WHERE k.workspace_id = ${workspaceId} AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
        AND e.observed_at >= ${from.toISOString()}::timestamptz AND e.observed_at < ${to.toISOString()}::timestamptz
    )
    SELECT ev.sku_id::text, ev.ref, ev.label, ev.shop_id::text, ev.shop_name, ev.seller_name, ev.observed_at::text,
      ev.after_total::text, ev.after_av, prev.total::text AS before_total, prev.availability AS before_av, count(*) OVER ()::text AS total
    FROM ev LEFT JOIN LATERAL (
      SELECT p.price + coalesce(p.shipping_cost, 0) AS total, p.availability FROM price_events p
      WHERE p.offer_id = ev.offer_id AND p.observed_at < ev.observed_at ORDER BY p.observed_at DESC LIMIT 1
    ) prev ON true
    -- A reactivation at the same price and stock is no change for the customer.
    WHERE prev.total IS DISTINCT FROM ev.after_total OR prev.availability IS DISTINCT FROM ev.after_av
    ORDER BY ev.observed_at DESC, ev.sku_id LIMIT ${limit}`);
  return {
    total: Number(r.rows[0]?.total ?? 0),
    changes: r.rows.map((x) => ({
      skuId: Number(x.sku_id),
      ref: x.ref,
      label: x.label,
      shopName: x.shop_name,
      sellerName: x.seller_name,
      own: ownShop !== null && Number(x.shop_id) === ownShop,
      observedAt: x.observed_at,
      beforeTotalBani: numericToBani(x.before_total),
      afterTotalBani: numericToBani(x.after_total)!,
      beforeAvailability: x.before_av,
      afterAvailability: x.after_av,
    })),
  };
}

/** Members who get today's digest: active workspaces with accepted terms, digest on. */
export async function b2bDigestRecipients(db: Exec): Promise<Array<{ workspaceId: number; workspaceName: string; userId: string; email: string }>> {
  const r = await db.execute<{ workspace_id: string; name: string; user_id: string; email: string }>(sql`
    SELECT w.id::text AS workspace_id, w.name, m.user_id, u.email FROM b2b_workspaces w
    JOIN b2b_members m ON m.workspace_id = w.id AND m.digest
    JOIN users u ON u.id = m.user_id
    WHERE w.status = 'active' AND w.terms_accepted_at IS NOT NULL
    ORDER BY w.id, u.email`);
  return r.rows.map((x) => ({ workspaceId: Number(x.workspace_id), workspaceName: x.name, userId: x.user_id, email: x.email }));
}

/**
 * Claims the digest of (workspace, day, member) before sending: true once per triple. A claim
 * left in `sending` by a crash is retried after 30 minutes (the mailer's idempotency key keeps a
 * provider from sending it twice).
 */
export async function claimB2bDigest(db: Exec, workspaceId: number, day: string, userId: string): Promise<boolean> {
  const r = await db.execute(sql`
    INSERT INTO b2b_digests (workspace_id, day, user_id) VALUES (${workspaceId}, ${day}::date, ${userId})
    ON CONFLICT (workspace_id, day, user_id) DO UPDATE SET claimed_at = now(), status = 'sending', error = NULL
    WHERE b2b_digests.status = 'failed' OR (b2b_digests.status = 'sending' AND b2b_digests.claimed_at < now() - interval '30 minutes')`);
  return (r.rowCount ?? 0) > 0;
}

export async function finishB2bDigest(db: Exec, workspaceId: number, day: string, userId: string, result: { ok: true; changes: number } | { ok: false; error: string }): Promise<void> {
  await db.execute(sql`
    UPDATE b2b_digests SET status = ${result.ok ? 'sent' : 'failed'}, changes = ${result.ok ? result.changes : 0},
      sent_at = ${result.ok ? sql`now()` : null}, error = ${result.ok ? null : result.error.slice(0, 500)}
    WHERE workspace_id = ${workspaceId} AND day = ${day}::date AND user_id = ${userId}`);
}

// ---------------------------------------------------------------------------------------------
// API keys and quotas

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes: Buffer, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Creates a key; the full key is returned once and never stored (only the secret's SHA-256). */
export async function createB2bApiKey(db: Exec, workspaceId: number, name: string, createdBy: string): Promise<{ id: number; key: string; publicId: string }> {
  const publicId = base32(randomBytes(8), 12);
  const secret = randomBytes(32).toString('base64url');
  const r = await db.execute<{ id: string }>(sql`
    INSERT INTO b2b_api_keys (workspace_id, public_id, secret_hash, name, created_by)
    VALUES (${workspaceId}, ${publicId}, ${sha256(secret).toString('hex')}, ${name}, ${createdBy}) RETURNING id::text`);
  return { id: Number(r.rows[0]!.id), key: formatApiKey(publicId, secret), publicId };
}

export async function listB2bApiKeys(db: Exec, workspaceId: number): Promise<Array<{ id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }>> {
  const r = await db.execute<{ id: string; name: string; public_id: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>(sql`
    SELECT id::text, name, public_id, created_at::text, last_used_at::text, revoked_at::text FROM b2b_api_keys
    WHERE workspace_id = ${workspaceId} ORDER BY revoked_at NULLS FIRST, created_at DESC`);
  return r.rows.map((x) => ({ id: Number(x.id), name: x.name, prefix: `${B2B_API_KEY_PREFIX}${x.public_id}_…`, createdAt: x.created_at, lastUsedAt: x.last_used_at, revokedAt: x.revoked_at }));
}

export async function revokeB2bApiKey(db: Exec, workspaceId: number, keyId: number, by: string): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE b2b_api_keys SET revoked_at = now(), revoked_by = ${by} WHERE id = ${keyId} AND workspace_id = ${workspaceId} AND revoked_at IS NULL`);
  return (r.rowCount ?? 0) > 0;
}

export interface B2bApiPrincipal {
  keyId: number;
  workspaceId: number;
  plan: B2bPlanDb;
  status: B2bWorkspaceStatus;
  apiDailyQuota: number | null;
  skuLimit: number | null;
  termsAccepted: boolean;
}

const DUMMY_HASH = sha256('pretoscop-b2b-no-such-key');

/**
 * Authenticates a presented key: the row by public id (not revoked), then the SHA-256 of the
 * secret compared in constant time. An unknown id still runs one comparison, so timing does not
 * tell a wrong secret from an unknown key. Returns null for anything that is not a live key.
 */
export async function verifyB2bApiKey(db: Exec, presented: string | null): Promise<B2bApiPrincipal | null> {
  const parsed = parseApiKey(presented);
  if (!parsed) return null;
  const r = await db.execute<{
    id: string; workspace_id: string; secret_hash: string; plan: B2bPlanDb; status: B2bWorkspaceStatus; api_daily_quota: number | null; sku_limit: number | null; terms: boolean;
  }>(sql`
    SELECT k.id::text, k.workspace_id::text, k.secret_hash, w.plan, w.status, w.api_daily_quota, w.sku_limit, (w.terms_accepted_at IS NOT NULL) AS terms
    FROM b2b_api_keys k JOIN b2b_workspaces w ON w.id = k.workspace_id
    WHERE k.public_id = ${parsed.publicId} AND k.revoked_at IS NULL`);
  const row = r.rows[0];
  const stored = row && /^[0-9a-f]{64}$/.test(row.secret_hash) ? Buffer.from(row.secret_hash, 'hex') : DUMMY_HASH;
  const match = timingSafeEqual(sha256(parsed.secret), stored);
  if (!row || !match) return null;
  return {
    keyId: Number(row.id),
    workspaceId: Number(row.workspace_id),
    plan: row.plan,
    status: row.status,
    apiDailyQuota: row.api_daily_quota,
    skuLimit: row.sku_limit,
    termsAccepted: row.terms,
  };
}

/** Marks a key used (at most once a minute per key: no write per request). */
export async function touchB2bApiKey(db: Exec, keyId: number): Promise<void> {
  await db.execute(sql`UPDATE b2b_api_keys SET last_used_at = now() WHERE id = ${keyId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`);
}

export interface B2bQuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  day: string;
}

/**
 * Counts one API request against the workspace's daily quota (Europe/Bucharest day). One atomic
 * upsert: the row lock serializes concurrent requests and the `WHERE requests < limit` is checked
 * on the latest row, so the count can never pass the limit, whatever the concurrency.
 */
export async function consumeB2bApiQuota(db: Exec, workspaceId: number, limit: number, day = bucharestToday()): Promise<B2bQuotaDecision> {
  if (limit <= 0) return { allowed: false, used: 0, limit: 0, day };
  const r = await db.execute<{ requests: number }>(sql`
    INSERT INTO b2b_api_usage (workspace_id, day, requests) VALUES (${workspaceId}, ${day}::date, 1)
    ON CONFLICT (workspace_id, day) DO UPDATE SET requests = b2b_api_usage.requests + 1
    WHERE b2b_api_usage.requests < ${limit}
    RETURNING requests`);
  if (r.rows[0]) return { allowed: true, used: Number(r.rows[0].requests), limit, day };
  const refused = await db.execute<{ requests: number }>(sql`
    UPDATE b2b_api_usage SET refused = refused + 1 WHERE workspace_id = ${workspaceId} AND day = ${day}::date RETURNING requests`);
  return { allowed: false, used: Number(refused.rows[0]?.requests ?? limit), limit, day };
}

export async function listB2bApiUsage(db: Exec, workspaceId: number, days = 30): Promise<Array<{ day: string; requests: number; refused: number }>> {
  const r = await db.execute<{ day: string; requests: number; refused: number }>(sql`
    SELECT day::text, requests, refused FROM b2b_api_usage WHERE workspace_id = ${workspaceId} AND day > current_date - ${days}::int ORDER BY day DESC`);
  return r.rows.map((x) => ({ day: x.day, requests: Number(x.requests), refused: Number(x.refused) }));
}

/** Retention: usage counters older than 400 days and digest receipts older than 90 days. */
export async function pruneB2bLogs(db: Exec): Promise<{ usage: number; digests: number }> {
  const u = await db.execute(sql`DELETE FROM b2b_api_usage WHERE day < current_date - 400`);
  const d = await db.execute(sql`DELETE FROM b2b_digests WHERE day < current_date - 90`);
  return { usage: u.rowCount ?? 0, digests: d.rowCount ?? 0 };
}

// ---------------------------------------------------------------------------------------------
// Admin

export interface B2bWorkspaceSummary {
  id: number;
  name: string;
  kind: B2bWorkspaceKind;
  plan: B2bPlanDb;
  status: B2bWorkspaceStatus;
  shopName: string | null;
  skus: number;
  members: number;
  invites: number;
  activeKeys: number;
  requestsToday: number;
  termsAccepted: boolean;
  billingStatus: string;
  createdAt: string;
}

export async function b2bWorkspaceSummaries(db: Exec): Promise<B2bWorkspaceSummary[]> {
  const r = await db.execute<{
    id: string; name: string; kind: B2bWorkspaceKind; plan: B2bPlanDb; status: B2bWorkspaceStatus; shop_name: string | null; skus: string; members: string;
    invites: string; keys: string; today: number | null; terms: boolean; billing_status: string; created_at: string;
  }>(sql`
    SELECT w.id::text, w.name, w.kind, w.plan, w.status, s.name AS shop_name,
      (SELECT count(*) FROM b2b_skus k WHERE k.workspace_id = w.id)::text AS skus,
      (SELECT count(*) FROM b2b_members m WHERE m.workspace_id = w.id)::text AS members,
      (SELECT count(*) FROM b2b_invites i WHERE i.workspace_id = w.id AND i.accepted_at IS NULL)::text AS invites,
      (SELECT count(*) FROM b2b_api_keys a WHERE a.workspace_id = w.id AND a.revoked_at IS NULL)::text AS keys,
      (SELECT requests FROM b2b_api_usage u WHERE u.workspace_id = w.id AND u.day = ${bucharestToday()}::date) AS today,
      (w.terms_accepted_at IS NOT NULL) AS terms, w.billing_status, w.created_at::text
    FROM b2b_workspaces w LEFT JOIN shops s ON s.id = w.shop_id ORDER BY w.status, w.name, w.id`);
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: x.name,
    kind: x.kind,
    plan: x.plan,
    status: x.status,
    shopName: x.shop_name,
    skus: Number(x.skus),
    members: Number(x.members),
    invites: Number(x.invites),
    activeKeys: Number(x.keys),
    requestsToday: Number(x.today ?? 0),
    termsAccepted: x.terms,
    billingStatus: x.billing_status,
    createdAt: x.created_at,
  }));
}
