import { alertsDeliverJob, alertsEvaluateJob, alertsRetentionJob } from './alerts';
import { affiliateSyncJob, commissionsImportJob } from './affiliate';
import { heartbeatJob } from './heartbeat';
import { partitionsJob, requestLogPruneJob } from './maintenance';
import { backupJob, restoreTestJob, schedulerTickJob, sourceRunJob } from './recorder';
import { icecatSyncJob } from './icecat';
import { matchPendingJob } from './matching';
import { opsAlertJob, opsHeartbeatJob, opsSloCheckJob } from './ops';
import { merchantValidateJob, merchantVerifyDomainJob } from './merchants';
import { fxRatesJob, rollupDailyJob, rollupTouchJob } from './rollup';
import { searchRebuildJob, searchSyncJob } from './search';
import { sitemapBuildJob } from './sitemap';
import type { JobDefinition } from './types';

/** Every job the worker runs. Later modules append their definitions here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const jobs: JobDefinition<any>[] = [
  heartbeatJob,
  partitionsJob,
  requestLogPruneJob,
  schedulerTickJob,
  sourceRunJob,
  backupJob,
  restoreTestJob,
  rollupDailyJob,
  rollupTouchJob,
  fxRatesJob,
  matchPendingJob,
  opsAlertJob,
  opsHeartbeatJob,
  opsSloCheckJob,
  alertsEvaluateJob,
  alertsDeliverJob,
  alertsRetentionJob,
  affiliateSyncJob,
  commissionsImportJob,
  icecatSyncJob,
  merchantValidateJob,
  merchantVerifyDomainJob,
  searchSyncJob,
  searchRebuildJob,
  sitemapBuildJob,
];
