import type { Env } from '@pretoscop/config/env';
import type { AlertChannel, Db } from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import type { AlertLinks, Operator, PushSender, TelegramClient } from '@pretoscop/notify';
import type { FetchLike, NormalizeFn, OpsAlert } from '../recorder/types';
import type { Notifier } from '../alerts/notifier';
import type { BlobStore } from '@pretoscop/storage';
import type { Logger } from '@pretoscop/config/logger';
import type { Job, PgBoss, Queue, WorkOptions } from 'pg-boss';

/** Price alerts (M19): channels, signed links, sender identity, the ALERTS_SECRET. */
export interface AlertServices {
  notifier: Notifier;
  /** Channels with a configured sender (email always; push with VAPID keys; Telegram with a token). */
  channels: AlertChannel[];
  mailer: Mailer;
  /** M27, when VAPID keys are set. */
  push?: PushSender;
  /** M27, when TELEGRAM_BOT_TOKEN is set. */
  telegram?: TelegramClient;
  links: AlertLinks;
  operator: Operator;
  secret: string;
}

/** Long-lived collaborators shared by jobs (created once per worker process). */
export interface Services {
  blob: BlobStore;
  fetcher: FetchLike;
  normalize: NormalizeFn;
  alert: OpsAlert;
  /** Marks cached web pages stale by tag (best effort; returns how many tags were accepted). */
  revalidate: (tags: string[]) => Promise<number>;
  alerts: AlertServices;
}

export interface JobContext {
  boss: PgBoss;
  db: Db;
  services: Services;
  env: Env;
  log: Logger;
}

/**
 * One background job: its queue options, worker options, optional cron schedule and handler.
 * Handlers must be idempotent (CLAUDE.md conventions): pg-boss may deliver a job more than once.
 */
export interface JobDefinition<T extends object = object> {
  name: string;
  queue?: Omit<Queue, 'name'>;
  work?: WorkOptions;
  /** Cron expression evaluated in Europe/Bucharest unless `tz` is set. */
  schedule?: { cron: string; data?: object; tz?: string };
  /** Send one job at startup in addition to the schedule. */
  runOnStart?: boolean;
  handler: (job: Job<T>, ctx: JobContext) => Promise<unknown>;
}

export function defineJob<T extends object>(def: JobDefinition<T>): JobDefinition<T> {
  return def;
}
