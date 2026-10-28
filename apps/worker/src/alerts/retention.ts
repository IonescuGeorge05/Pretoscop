import type { Logger } from '@pretoscop/config/logger';
import { ALERT_CONFIRM_TTL_DAYS } from '@pretoscop/core';
import {
  deleteEmptyAccounts,
  deleteExpiredPendingAlerts,
  deleteExpiredVerifications,
  deleteUserData,
  isFlagEnabled,
  markRetentionNotice,
  minimizeClicksAndEvents,
  pruneAlertSends,
  pruneConsentRecords,
  pruneDeliveryReceipts,
  pruneTelegramLinkTokens,
  repointMergedAlerts,
  suppressionReason,
  usersDueRetentionDeletion,
  usersDueRetentionNotice,
  type Db,
} from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import { emailHash, retentionNoticeEmail, type AlertLinks, type Operator } from '@pretoscop/notify';
import type { OpsAlert } from '../recorder/types';
import { CHANNEL_FLAGS } from './evaluate';

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
  /** Operations alert for a step that failed (the other steps still run). */
  opsAlert?: OpsAlert;
}

export interface RetentionResult {
  pendingDeleted: number;
  alertsRepointed: number;
  emptyAccountsDeleted: number;
  notices: number;
  /** Notices recorded without an email: the address is on the suppression list. */
  noticesWithoutEmail: number;
  accountsDeleted: number;
  consentRecordsPruned: number;
  sendsPruned: number;
  clicksEventsAnonymized: number;
  clicksEventsDeleted: number;
  verificationsDeleted: number;
  /** M27: expired one-time Telegram link tokens. */
  telegramLinkTokensDeleted: number;
  /** M27: push/Telegram delivery receipts older than 7 days (idempotency only). */
  deliveryReceiptsDeleted: number;
  /** Steps that threw (logged and reported); empty on a clean night. */
  failedSteps: string[];
}

/**
 * Nightly: everything the privacy policy promises to delete or minimize, in one idempotent pass.
 * Each step runs on its own: one that fails is logged and reported to operations, and the others
 * still run (a broken step must never stop every deletion).
 */
export async function runAlertRetention(deps: RetentionDeps, now: Date = new Date()): Promise<RetentionResult> {
  const { db, log } = deps;
  const out: RetentionResult = {
    pendingDeleted: 0,
    alertsRepointed: 0,
    emptyAccountsDeleted: 0,
    notices: 0,
    noticesWithoutEmail: 0,
    accountsDeleted: 0,
    consentRecordsPruned: 0,
    sendsPruned: 0,
    clicksEventsAnonymized: 0,
    clicksEventsDeleted: 0,
    verificationsDeleted: 0,
    telegramLinkTokensDeleted: 0,
    deliveryReceiptsDeleted: 0,
    failedSteps: [],
  };

  const step = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const error = (err as Error).message.slice(0, 300);
      out.failedSteps.push(name);
      log?.error({ step: name, error }, 'alert retention step failed');
      await deps.opsAlert?.(`Alert retention step failed: ${name}`, { step: name, error }).catch(() => undefined);
    }
  };

  await step('pending', async () => {
    out.pendingDeleted = await deleteExpiredPendingAlerts(db, ALERT_CONFIRM_TTL_DAYS);
  });
  await step('merged', async () => {
    out.alertsRepointed = await repointMergedAlerts(db);
  });
  await step('empty_accounts', async () => {
    out.emptyAccountsDeleted = await deleteEmptyAccounts(db, { unverifiedDays: RETENTION.unverifiedAccountDays, inactiveMonths: RETENTION.inactiveMonths });
  });

  // The 30-day notice is an email: only while alert emails are on (flag), and never to an address on
  // the suppression list. A suppressed address gets its notice recorded without an email, so the
  // inactive account is still deleted when the grace period ends.
  await step('notices', async () => {
    if (!(await isFlagEnabled(db, CHANNEL_FLAGS.email))) return;
    for (const u of await usersDueRetentionNotice(db, RETENTION.inactiveMonths)) {
      try {
        if (await suppressionReason(db, emailHash(deps.secret, u.email))) {
          await markRetentionNotice(db, u.id);
          out.noticesWithoutEmail++;
          continue;
        }
        const mail = retentionNoticeEmail({
          keepUrl: deps.links.keepAccount(u.id),
          manageUrl: deps.links.manage(),
          deleteOn: new Date(now.getTime() + RETENTION.noticeGraceDays * 86_400_000),
          alertCount: u.alertCount,
          operator: deps.operator,
        });
        await deps.mailer.send({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html, tags: { kind: 'retention_notice' } });
        await markRetentionNotice(db, u.id);
        out.notices++;
      } catch (err) {
        // No notice, no deletion: the account waits for the next night.
        log?.warn({ err: (err as Error).message }, 'retention notice failed');
      }
    }
  });
  await step('inactive_accounts', async () => {
    for (const u of await usersDueRetentionDeletion(db, RETENTION.noticeGraceDays)) {
      if (await deleteUserData(db, u.id, { method: 'retention', emailHash: emailHash(deps.secret, u.email) })) out.accountsDeleted++;
    }
  });
  await step('consent_records', async () => {
    out.consentRecordsPruned = await pruneConsentRecords(db, { keepYears: RETENTION.consentEvidenceYears, unconfirmedDays: RETENTION.unconfirmedConsentDays });
  });
  await step('alert_sends', async () => {
    out.sendsPruned = await pruneAlertSends(db, RETENTION.alertSendsMonths);
  });
  await step('clicks_events', async () => {
    const ce = await minimizeClicksAndEvents(db);
    out.clicksEventsAnonymized = ce.anonymized;
    out.clicksEventsDeleted = ce.deleted;
  });
  // Magic-link tokens (they carry the address) and send counters past their expiry.
  await step('verifications', async () => {
    out.verificationsDeleted = await deleteExpiredVerifications(db);
  });
  // M27: one-time Telegram link tokens past their 15 minutes; delivery receipts after a week.
  await step('telegram_link_tokens', async () => {
    out.telegramLinkTokensDeleted = await pruneTelegramLinkTokens(db);
  });
  await step('delivery_receipts', async () => {
    out.deliveryReceiptsDeleted = await pruneDeliveryReceipts(db, 7);
  });
  return out;
}
