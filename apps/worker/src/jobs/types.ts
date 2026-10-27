import type { Env } from '@pretoscop/config/env';
import type { Db } from '@pretoscop/db';
import type { FetchLike, NormalizeFn, OpsAlert } from '../recorder/types';
import type { BlobStore } from '@pretoscop/storage';
import type { Logger } from '@pretoscop/config/logger';
import type { Job, PgBoss, Queue, WorkOptions } from 'pg-boss';

/** Long-lived collaborators shared by jobs (created once per worker process). */
export interface Services {
  blob: BlobStore;
  fetcher: FetchLike;
  normalize: NormalizeFn;
  alert: OpsAlert;
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
