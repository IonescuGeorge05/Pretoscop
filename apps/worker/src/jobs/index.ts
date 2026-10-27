import { heartbeatJob } from './heartbeat';
import { partitionsJob, requestLogPruneJob } from './maintenance';
import { backupJob, restoreTestJob, schedulerTickJob, sourceRunJob } from './recorder';
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
];
