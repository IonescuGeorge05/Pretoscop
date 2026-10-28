// Alert notifications (M19; push and Telegram arrive with M27): signed links, the stable email
// pseudonym, Romanian message templates and channel senders. Server-only (node:crypto).
export { alertLinks, emailHash, signLink, verifyLink, type AlertLinks, type LinkPurpose } from './links';
export {
  alertDigestEmail,
  confirmationEmail,
  reasonLine,
  retentionNoticeEmail,
  type AlertDigestInput,
  type AlertItem,
  type AlertReason,
  type ConfirmationEmailInput,
  type Operator,
  type ReferenceKind,
  type RenderedEmail,
  type RetentionNoticeInput,
} from './email';
export { deliveryLine, dropPercent, esc, formatDateTime, formatLongDate, lei, shorten, toBani } from './format';
