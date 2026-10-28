import type { Env } from '@pretoscop/config/env';
import type { Db } from '@pretoscop/db';
import type { Mailer } from '@pretoscop/mailer';
import type { AlertLinks, Operator } from '@pretoscop/notify';
import type { FetchLike, NormalizeFn, OpsAlert } from '../recorder/types';
import type { Notifier } from '../alerts/notifier';
import type { BlobStore } from '@pretoscop/storage';
import type { Logger } from '@pretoscop/config/logger';
import type { Job, PgBoss, Queue, WorkOptions } from 'pg-boss';
import type { MetricFamily } from '../ops/prometheus';
import type { SloAlert } from '../ops/slo';

/** Price alerts (M19): channels, signed links, sender identity, the ALERTS_SECRET. */
export interface AlertServices {
  notifier: Notifier;
  mailer: Mailer;
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
  /** When this worker process started (SLO checks give scheduled jobs time to run first). */
  startedAt?: Date;
  /** Extra SLO checks contributed by other modules (the assisted channel, M05B). */
  sloExtra?: () => Promise<SloAlert[]>;
  /** Extra Prometheus metric families contributed by other modules (M05B). */
  metricsExtra?: () => Promise<MetricFamily[]>;
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
