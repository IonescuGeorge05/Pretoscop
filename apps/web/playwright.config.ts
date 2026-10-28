import { defineConfig, devices } from '@playwright/test';
import { E2E_SEARCH_PREFIX } from './e2e/fixture';

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: './e2e',
  // Creates (and afterwards removes) the throwaway product used by product.spec.ts.
  globalSetup: './e2e/global-setup.ts',
  // Generous: the dev box also runs the recorder and several builds; CI can tighten these.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ro-RO', timezoneId: 'Europe/Bucharest' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // The e2e search indexes (global setup; this checkout's prefix + `e2e_`), no analytics rows from
    // test traffic, and a test affiliate code so M24's quicklinks can be checked (no real account exists).
    env: {
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      MEILI_INDEX_PREFIX: E2E_SEARCH_PREFIX,
      EVENTS_ENABLED: 'false',
      TWOPERFORMANT_UNIQUE_CODE: 'e2e-aff',
    },
  },
});
