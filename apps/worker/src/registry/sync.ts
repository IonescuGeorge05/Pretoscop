import { type ShopConfig, loadShops } from '@pretoscop/config/shops';
import {
  affiliatePrograms,
  auditLog,
  ensureKnownFlags,
  shopSources,
  shops,
  type Db,
} from '@pretoscop/db';
import { isKnownParserKey } from '@pretoscop/extractors';
import { eq } from 'drizzle-orm';

export interface SyncCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface SyncReport {
  shops: SyncCounts;
  sources: SyncCounts & { disabled: number };
  programs: SyncCounts;
  changes: string[];
}

/** JSON with sorted keys, so jsonb values compare structurally. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function differs(current: Record<string, unknown>, desired: Record<string, unknown>): string[] {
  return Object.keys(desired).filter((k) => stableStringify(current[k]) !== stableStringify(desired[k]));
}

function shopRow(s: ShopConfig) {
  const legalNotes = [s.legal.terms_note, s.legal.robots_note, s.legal.written_permission_ref ? `Written permission: ${s.legal.written_permission_ref}` : undefined]
    .filter(Boolean)
    .join('\n');
  return {
    slug: s.slug,
    name: s.name,
    domain: s.domain,
    websiteUrl: s.website_url,
    kind: s.kind,
    status: s.status,
    accessMode: s.access_mode,
    legalBasisRef: s.legal.basis_ref,
    trustTier: s.trust_tier,
    shippingRules: {
      free_over: s.shipping.free_over,
      flat: s.shipping.flat,
      locker_flat: s.shipping.locker_flat,
      ...(s.shipping.notes ? { notes: s.shipping.notes } : {}),
    },
    shippingVerified: s.shipping.verified,
    warrantyMonthsDefault: s.warranty_months_default,
    crawlPolicy: { ...s.crawl_policy },
    vatIncludedDefault: s.vat_included_default,
    legalNotes: legalNotes || null,
    searchUrlTemplate: s.search_url ?? null,
  };
}

/**
 * Upserts the YAML registry into `shops`, `shop_sources` and `affiliate_programs`. Idempotent:
 * a second run reports only `unchanged`. The YAML owns configuration; the database owns runtime
 * switches: `shop_sources.kill_switch` is only ever forced on (when the YAML says so), never off,
 * and feature flags are only created (off), never changed. Sources removed from the YAML are
 * disabled, not deleted (their runs and offers keep their history). Merchant feeds created by the
 * portal (`config.origin = 'merchant'`, M20) are left alone, and shops that exist only in the
 * database (merchant shops) are never touched.
 */
export async function syncShops(db: Db, registry: ShopConfig[] = loadShops(), actor = 'system:shops-sync'): Promise<SyncReport> {
  const unknown = registry.flatMap((s) => s.sources).filter((src) => !isKnownParserKey(src.parser_key));
  if (unknown.length > 0) {
    throw new Error(`Unknown parser_key: ${unknown.map((u) => `${u.key} → ${u.parser_key}`).join(', ')}`);
  }
  const report: SyncReport = {
    shops: { inserted: 0, updated: 0, unchanged: 0 },
    sources: { inserted: 0, updated: 0, unchanged: 0, disabled: 0 },
    programs: { inserted: 0, updated: 0, unchanged: 0 },
    changes: [],
  };

  await db.transaction(async (tx) => {
    const existingShops = new Map((await tx.select().from(shops)).map((r) => [r.slug, r]));
    const existingSources = new Map((await tx.select().from(shopSources)).map((r) => [r.key, r]));
    const existingPrograms = await tx.select().from(affiliatePrograms);

    for (const cfg of registry) {
      const desired = shopRow(cfg);
      let shopId: number;
      const cur = existingShops.get(cfg.slug);
      if (!cur) {
        const [row] = await tx.insert(shops).values(desired).returning({ id: shops.id });
        shopId = row!.id;
        report.shops.inserted++;
        report.changes.push(`shop ${cfg.slug}: inserted`);
      } else {
        shopId = cur.id;
        const diff = differs(cur as unknown as Record<string, unknown>, desired);
        if (diff.length > 0) {
          await tx.update(shops).set(desired).where(eq(shops.id, cur.id));
          report.shops.updated++;
          report.changes.push(`shop ${cfg.slug}: ${diff.join(', ')}`);
        } else report.shops.unchanged++;
      }

      const yamlKeys = new Set<string>();
      for (const src of cfg.sources) {
        yamlKeys.add(src.key);
        const desiredSrc = {
          shopId,
          key: src.key,
          kind: src.kind,
          url: src.url,
          format: src.format ?? null,
          parserKey: src.parser_key,
          schedule: src.schedule,
          config: src.config,
          enabled: src.enabled,
          freshnessSloHours: src.freshness_slo_hours ?? cfg.crawl_policy.freshness_slo_hours,
          sourceTier: src.source_tier,
        };
        const curSrc = existingSources.get(src.key);
        if (!curSrc) {
          await tx.insert(shopSources).values({ ...desiredSrc, killSwitch: src.kill_switch });
          report.sources.inserted++;
          report.changes.push(`source ${src.key}: inserted`);
          continue;
        }
        const diff = differs(curSrc as unknown as Record<string, unknown>, desiredSrc);
        const forceKill = src.kill_switch && !curSrc.killSwitch;
        if (diff.length > 0 || forceKill) {
          await tx
            .update(shopSources)
            .set({ ...desiredSrc, ...(forceKill ? { killSwitch: true } : {}) })
            .where(eq(shopSources.id, curSrc.id));
          report.sources.updated++;
          report.changes.push(`source ${src.key}: ${[...diff, ...(forceKill ? ['kill_switch'] : [])].join(', ')}`);
        } else report.sources.unchanged++;
      }
      for (const [key, row] of existingSources) {
        // Feeds a merchant registered through the portal (M20) are owned by the portal, not the YAML.
        const merchantOwned = (row.config as Record<string, unknown> | null)?.origin === 'merchant';
        if (row.shopId === shopId && !yamlKeys.has(key) && row.enabled && !merchantOwned) {
          await tx.update(shopSources).set({ enabled: false }).where(eq(shopSources.id, row.id));
          report.sources.disabled++;
          report.changes.push(`source ${key}: disabled (removed from YAML)`);
        }
      }

      const aff = cfg.affiliate;
      if (aff && aff.network !== 'none') {
        const desiredProg = {
          shopId,
          network: aff.network,
          programExternalId: aff.program_external_id,
          commissionText: aff.commission_text,
          cookieDays: aff.cookie_days,
          comparatorPolicy: aff.comparator_policy,
          linkTemplate: aff.link_template,
          feedAvailable: aff.feed_available,
          status: aff.status,
          notes: aff.notes ?? null,
        };
        const curProg = existingPrograms.find((p) => p.shopId === shopId && p.network === aff.network);
        if (!curProg) {
          await tx.insert(affiliatePrograms).values(desiredProg);
          report.programs.inserted++;
          report.changes.push(`program ${cfg.slug}/${aff.network}: inserted`);
        } else {
          const diff = differs(curProg as unknown as Record<string, unknown>, desiredProg);
          if (diff.length > 0) {
            await tx.update(affiliatePrograms).set(desiredProg).where(eq(affiliatePrograms.id, curProg.id));
            report.programs.updated++;
            report.changes.push(`program ${cfg.slug}/${aff.network}: ${diff.join(', ')}`);
          } else report.programs.unchanged++;
        }
      }
    }

    if (report.changes.length > 0) {
      await tx.insert(auditLog).values({
        actor,
        action: 'shops.sync',
        entity: 'registry',
        entityId: null,
        before: null,
        after: { changes: report.changes.slice(0, 500) },
      });
    }
  });
  await ensureKnownFlags(db);
  return report;
}
