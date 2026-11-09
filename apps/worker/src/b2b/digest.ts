import type { Logger } from '@pretoscop/config/logger';
import { B2B_STATUS_LABELS, pctOneDecimal } from '@pretoscop/core';
import {
  b2bChanges,
  b2bDigestRecipients,
  b2bPositions,
  bucharestToday,
  claimB2bDigest,
  finishB2bDigest,
  suppressionReason,
  type B2bChange,
  type B2bPositionRow,
  type Db,
} from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import { emailHash, esc, formatDateTime, lei, shorten, type Operator } from '@pretoscop/notify';

/**
 * Daily B2B digest (M28): one email per member who wants it, per workspace, with the observed
 * price and stock changes of the last 24 hours on the workspace's SKUs and where the customer's
 * prices stand. Only this workspace's rows (tenant isolation lives in the queries); nothing is sent
 * when nothing changed. Idempotent: a (workspace, day, member) is claimed before sending and the
 * mailer gets a stable idempotency key.
 */

const MAX_LINES = 50;
const BRAND = '#1d7a73';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

export interface DigestEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

const AVAIL: Record<string, string> = { in_stock: 'în stoc', out_of_stock: 'fără stoc', preorder: 'precomandă', unknown: 'stoc necunoscut' };

function changeLine(c: B2bChange): string {
  const who = `${c.shopName}${c.sellerName ? ` (${c.sellerName})` : ''}${c.own ? ' — magazinul tău' : ''}`;
  if (c.beforeTotalBani === null) return `${who}: ofertă nouă, ${lei(c.afterTotalBani)}, ${AVAIL[c.afterAvailability] ?? c.afterAvailability}`;
  const parts: string[] = [];
  if (c.beforeTotalBani !== c.afterTotalBani) {
    const pct = pctOneDecimal(c.afterTotalBani - c.beforeTotalBani, c.beforeTotalBani);
    parts.push(`${lei(c.beforeTotalBani)} → ${lei(c.afterTotalBani)}${pct === null ? '' : ` (${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')}%)`}`);
  }
  if (c.beforeAvailability !== c.afterAvailability) parts.push(`${AVAIL[c.beforeAvailability ?? ''] ?? c.beforeAvailability} → ${AVAIL[c.afterAvailability] ?? c.afterAvailability}`);
  return `${who}: ${parts.join(', ')}`;
}

export function summaryLine(rows: readonly B2bPositionRow[]): string {
  const matched = rows.filter((r) => r.status === 'matched');
  const cheapest = matched.filter((r) => r.position.status === 'cheapest' || r.position.status === 'tied').length;
  const above = matched.filter((r) => r.position.status === 'above').length;
  return `Urmărești ${rows.length} SKU-uri (${matched.length} găsite în catalog): ${cheapest} la cel mai mic preț, ${above} peste minimul concurenței.`;
}

export function digestEmail(i: {
  workspaceName: string;
  workspaceUrl: string;
  settingsUrl: string;
  changes: B2bChange[];
  total: number;
  rows: readonly B2bPositionRow[];
  since: Date;
  operator: Operator;
}): DigestEmail {
  const subject = `Pretoscop B2B — ${i.workspaceName}: ${i.total === 1 ? 'o schimbare' : `${i.total} schimbări`} de preț în ultimele 24 de ore`;
  const shown = i.changes.slice(0, MAX_LINES);
  // Group by SKU, newest change first (the query's order).
  const groups = new Map<number, { label: string; ref: string | null; lines: B2bChange[] }>();
  for (const c of shown) {
    const g = groups.get(c.skuId) ?? { label: c.label, ref: c.ref, lines: [] };
    g.lines.push(c);
    groups.set(c.skuId, g);
  }
  const statusOf = new Map(i.rows.map((r) => [r.skuId, r]));
  const more = i.total - shown.length;
  const intro = `Schimbările de preț și stoc observate de Pretoscop din ${formatDateTime(i.since)} până acum (ora României), la produsele urmărite în „${i.workspaceName}”.`;
  const textGroups = [...groups.entries()].map(([skuId, g]) => {
    const r = statusOf.get(skuId);
    const pos = r && r.status === 'matched' ? ` [${B2B_STATUS_LABELS[r.position.status]}]` : '';
    return [`${g.ref ? `${g.ref} · ` : ''}${g.label}${pos}`, ...g.lines.map((c) => `  - ${changeLine(c)} (${formatDateTime(c.observedAt)})`)].join('\n');
  });
  const footer = [
    'Primești acest email pentru că ești membru al spațiului de lucru și ai ales rezumatul zilnic.',
    `Îl poți opri din Setări: ${i.settingsUrl}`,
    'Datele se folosesc doar intern, conform Termenilor pentru clienții B2B.',
  ];
  const text = [
    intro,
    '',
    summaryLine(i.rows),
    '',
    textGroups.join('\n\n'),
    ...(more > 0 ? ['', `Și încă ${more} schimbări: ${i.workspaceUrl}`] : []),
    '',
    `Tabelul complet: ${i.workspaceUrl}`,
    '',
    ...footer,
    '',
    `— ${i.operator.name}, ${i.operator.address}`,
    i.operator.website,
  ].join('\n');
  const htmlGroups = [...groups.entries()]
    .map(([skuId, g]) => {
      const r = statusOf.get(skuId);
      const pos = r && r.status === 'matched' ? ` <span style="color:${MUTED};font-weight:400">· ${esc(B2B_STATUS_LABELS[r.position.status])}</span>` : '';
      return [
        `<div style="border-top:1px solid ${LINE};padding:12px 0 4px">`,
        `<p style="margin:0;font-weight:600">${g.ref ? `${esc(g.ref)} · ` : ''}${esc(shorten(g.label, 90))}${pos}</p>`,
        '<ul style="margin:6px 0 0;padding-left:18px;font-size:14px">',
        ...g.lines.map((c) => `<li>${esc(changeLine(c))} <span style="color:${MUTED};font-size:12px">(${esc(formatDateTime(c.observedAt))})</span></li>`),
        '</ul></div>',
      ].join('');
    })
    .join('');
  const html = [
    '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:#f8fafc">`,
    `<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">`,
    `<p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${BRAND}">Pretoscop <span style="font-weight:400;color:${MUTED}">pentru companii</span></p>`,
    `<div style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:20px">`,
    `<p style="margin:0 0 8px">${esc(intro)}</p>`,
    `<p style="margin:0 0 12px;font-weight:600">${esc(summaryLine(i.rows))}</p>`,
    htmlGroups,
    more > 0 ? `<p style="margin:12px 0 0">Și încă ${more} schimbări.</p>` : '',
    `<p style="margin:16px 0 0"><a href="${esc(i.workspaceUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Deschide tabelul</a></p>`,
    '</div>',
    `<div style="color:${MUTED};font-size:12px;line-height:1.5;margin-top:16px">`,
    `<p style="margin:0">${esc(footer[0]!)} <a href="${esc(i.settingsUrl)}" style="color:${MUTED}">Oprește rezumatul</a>. ${esc(footer[2]!)}</p>`,
    `<p style="margin:12px 0 0">${esc(i.operator.name)}, ${esc(i.operator.address)} · ${esc(i.operator.website.replace(/^https?:\/\//, ''))}</p>`,
    '</div></div></body></html>',
  ].join('');
  return { subject, text, html, headers: { 'List-Unsubscribe': `<${i.settingsUrl}>` } };
}

export interface DigestRunResult {
  workspaces: number;
  sent: number;
  empty: number;
  skipped: number;
  failed: number;
}

/**
 * Sends today's digests. `secret` keys the address hash of the suppression list (M19): addresses
 * that bounced, complained or were deleted get nothing.
 */
export async function runB2bDigest(deps: { db: Db; mailer: Mailer; operator: Operator; secret: string; log: Logger; now?: Date }): Promise<DigestRunResult> {
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const day = bucharestToday(now);
  const out: DigestRunResult = { workspaces: 0, sent: 0, empty: 0, skipped: 0, failed: 0 };
  const recipients = await b2bDigestRecipients(deps.db);
  const byWorkspace = new Map<number, typeof recipients>();
  for (const r of recipients) byWorkspace.set(r.workspaceId, [...(byWorkspace.get(r.workspaceId) ?? []), r]);
  for (const [workspaceId, members] of byWorkspace) {
    out.workspaces++;
    const { changes, total } = await b2bChanges(deps.db, workspaceId, since, now, MAX_LINES);
    const rows = total > 0 ? await b2bPositions(deps.db, workspaceId) : [];
    const base = deps.operator.website;
    for (const m of members) {
      const suppressed = await suppressionReason(deps.db, emailHash(deps.secret, m.email));
      if (suppressed === 'bounce' || suppressed === 'complaint' || suppressed === 'deleted') {
        out.skipped++;
        continue;
      }
      if (!(await claimB2bDigest(deps.db, workspaceId, day, m.userId))) {
        out.skipped++;
        continue;
      }
      if (total === 0) {
        await finishB2bDigest(deps.db, workspaceId, day, m.userId, { ok: true, changes: 0 });
        out.empty++;
        continue;
      }
      try {
        const email = digestEmail({
          workspaceName: m.workspaceName,
          workspaceUrl: `${base}/b2b/${workspaceId}`,
          settingsUrl: `${base}/b2b/${workspaceId}/setari`,
          changes,
          total,
          rows,
          since,
          operator: deps.operator,
        });
        await deps.mailer.send({ to: m.email, ...email, tags: { kind: 'b2b_digest' }, idempotencyKey: `b2b-digest:${workspaceId}:${day}:${m.userId}` });
        await finishB2bDigest(deps.db, workspaceId, day, m.userId, { ok: true, changes: total });
        out.sent++;
      } catch (err) {
        await finishB2bDigest(deps.db, workspaceId, day, m.userId, { ok: false, error: err instanceof Error ? err.message : String(err) });
        deps.log.error({ err, workspace_id: workspaceId }, 'b2b digest send failed');
        out.failed++;
      }
    }
  }
  return out;
}
