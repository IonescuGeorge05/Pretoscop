import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: './e2e',
  // Creates (and afterwards removes) the throwaway product used by product.spec.ts.
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
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
    // The e2e search index (global setup) and no analytics rows from test traffic.
    env: { PUBLIC_BASE_URL: `http://localhost:${PORT}`, MEILI_INDEX_PREFIX: 'e2e_', EVENTS_ENABLED: 'false' },
  },
});
