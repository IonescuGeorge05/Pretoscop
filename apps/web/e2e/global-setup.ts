import { fixtureCli, searchCli } from './fixture';

// Throwaway fixture rows in the dev database, then separate e2e search indexes (E2E_SEARCH_PREFIX)
// (the dev `products` index is never touched). Teardown removes both.
export default function globalSetup() {
  process.env.E2E_FIXTURE = JSON.stringify(fixtureCli('create'));
  searchCli('rebuild');
  return () => {
    fixtureCli('drop');
    searchCli('drop');
  };
}
