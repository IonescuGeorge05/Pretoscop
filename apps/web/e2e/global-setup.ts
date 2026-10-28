import { fixtureCli, searchCli } from './fixture';

/**
 * Creates (and afterwards removes) the shared product-page fixture and, from it, separate e2e
 * search indexes (E2E_SEARCH_PREFIX; the dev indexes are never touched). `E2E_SHARED_FIXTURE=0` skips
 * it for runs that only use their own fixtures (alerts.spec.ts), so a run never recreates the
 * product another, concurrent run is testing.
 */
export default function globalSetup() {
  if (process.env.E2E_SHARED_FIXTURE === '0') return undefined;
  process.env.E2E_FIXTURE = JSON.stringify(fixtureCli('create'));
  searchCli('rebuild');
  return () => {
    fixtureCli('drop');
    searchCli('drop');
  };
}
