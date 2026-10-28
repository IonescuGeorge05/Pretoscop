import { defineConfig, devices } from '@playwright/test';

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
    // A test affiliate code so M24's quicklinks can be checked (no real account exists).
    env: { PUBLIC_BASE_URL: `http://localhost:${PORT}`, TWOPERFORMANT_UNIQUE_CODE: 'e2e-aff' },
  },
});
