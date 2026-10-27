import { defineJob } from './types';

/** Liveness signal: logs once a minute so `make verify M=00` and humans can see the worker is alive. */
export const heartbeatJob = defineJob({
  name: 'system.heartbeat',
  queue: { retryLimit: 0, expireInSeconds: 60, deleteAfterSeconds: 3600 },
  schedule: { cron: '* * * * *' },
  runOnStart: true,
  handler: async (job, { log }) => {
    log.info({ job_id: job.id, uptime_s: Math.round(process.uptime()) }, 'heartbeat');
  },
});
