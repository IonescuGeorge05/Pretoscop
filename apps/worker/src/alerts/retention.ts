import type { Logger } from '@pretoscop/config/logger';
import { ALERT_CONFIRM_TTL_DAYS } from '@pretoscop/core';
import {
  deleteEmptyAccounts,
  deleteExpiredPendingAlerts,
  deleteUserData,
  markRetentionNotice,
  minimizeClicksAndEvents,
  pruneAlertSends,
  pruneConsentRecords,
  pruneTelegramLinkTokens,
  repointMergedAlerts,
  usersDueRetentionDeletion,
  usersDueRetentionNotice,
  type Db,
} from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import { emailHash, retentionNoticeEmail, type AlertLinks, type Operator } from '@pretoscop/notify';

/** Published retention rules (privacy policy `/confidentialitate#alerte`, ROPA P5). */
export const RETENTION = {
  inactiveMonths: 24,
  noticeGraceDays: 30,
  unverifiedAccountDays: 7,
  consentEvidenceYears: 3,
  unconfirmedConsentDays: 30,
  alertSendsMonths: 13,
} as const;

export interface RetentionDeps {
  db: Db;
  mailer: Mailer;
  links: AlertLinks;
  operator: Operator;
  secret: string;
  log?: Logger;
}

export interface RetentionResult {
  pendingDeleted: number;
  alertsRepointed: number;
  emptyAccountsDeleted: number;
  notices: number;
  accountsDeleted: number;
  consentRecordsPruned: number;
  sendsPruned: number;
  clicksEventsAnonymized: number;
  clicksEventsDeleted: number;
}

/** Nightly: everything the privacy policy promises to delete or minimize, in one idempotent pass. */
export async function runAlertRetention(deps: RetentionDeps, now: Date = new Date()): Promise<RetentionResult> {
  const { db, log } = deps;
  const out: RetentionResult = {
    pendingDeleted: await deleteExpiredPendingAlerts(db, ALERT_CONFIRM_TTL_DAYS),
    alertsRepointed: await repointMergedAlerts(db),
    emptyAccountsDeleted: await deleteEmptyAccounts(db, { unverifiedDays: RETENTION.unverifiedAccountDays, inactiveMonths: RETENTION.inactiveMonths }),
    notices: 0,
    accountsDeleted: 0,
    consentRecordsPruned: 0,
    sendsPruned: 0,
    clicksEventsAnonymized: 0,
    clicksEventsDeleted: 0,
  };

  for (const u of await usersDueRetentionNotice(db, RETENTION.inactiveMonths)) {
    const mail = retentionNoticeEmail({
      keepUrl: deps.links.keepAccount(u.id),
      manageUrl: deps.links.manage(),
      deleteOn: new Date(now.getTime() + RETENTION.noticeGraceDays * 86_400_000),
      alertCount: u.alertCount,
      operator: deps.operator,
    });
    try {
      await deps.mailer.send({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html, tags: { kind: 'retention_notice' } });
      await markRetentionNotice(db, u.id);
      out.notices++;
    } catch (err) {
      // No notice, no deletion: the account waits for the next night.
      log?.warn({ err: (err as Error).message }, 'retention notice failed');
    }
  }
  for (const u of await usersDueRetentionDeletion(db, RETENTION.noticeGraceDays)) {
    if (await deleteUserData(db, u.id, { method: 'retention', emailHash: emailHash(deps.secret, u.email) })) out.accountsDeleted++;
  }

  out.consentRecordsPruned = await pruneConsentRecords(db, { keepYears: RETENTION.consentEvidenceYears, unconfirmedDays: RETENTION.unconfirmedConsentDays });
  out.sendsPruned = await pruneAlertSends(db, RETENTION.alertSendsMonths);
  await pruneTelegramLinkTokens(db);
  const ce = await minimizeClicksAndEvents(db);
  out.clicksEventsAnonymized = ce.anonymized;
  out.clicksEventsDeleted = ce.deleted;
  return out;
}
