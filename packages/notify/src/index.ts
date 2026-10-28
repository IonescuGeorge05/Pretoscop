// Alert notifications (M19 email, M27 push and Telegram): signed links, the stable email
// pseudonym, Romanian message templates and channel clients. Server-only (node:crypto).
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
export {
  createPushSender,
  generateVapidKeys,
  MAX_ENDPOINT_LENGTH,
  parsePushSubscription,
  PUSH_SERVICE_HOSTS,
  pushEndpointProblem,
  pushTopic,
  type PushConfig,
  type PushPayload,
  type PushResult,
  type PushSender,
  type PushSendOptions,
  type PushSubscriptionKeys,
} from './push';
export {
  createTelegramClient,
  TelegramApiError,
  tgEscape,
  type InlineButton,
  type TelegramClient,
  type TelegramClientOptions,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from './telegram';
export { dealsPostText, pushAlertPayload, telegramAlertMessage, type VerifiedDrop } from './channel-messages';
