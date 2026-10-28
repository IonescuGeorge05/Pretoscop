import { generateKeyPairSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { E2E_TELEGRAM } from './e2e/channels-env';
import { E2E_SEARCH_PREFIX } from './e2e/fixture';

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * Test VAPID keys for the Web Push e2e (M27), made at test time and never stored: the web server
 * and the worker CLIs the tests run share them through the environment (set once in the main
 * process, inherited by the test workers). A run may pass its own in E2E_VAPID_*.
 */
function testVapidKeys(): { publicKey: string; privateKey: string } {
  if (!process.env.E2E_VAPID_PUBLIC_KEY || !process.env.E2E_VAPID_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = privateKey.export({ format: 'jwk' });
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')]);
    process.env.E2E_VAPID_PUBLIC_KEY = raw.toString('base64url');
    process.env.E2E_VAPID_PRIVATE_KEY = jwk.d!;
  }
  return { publicKey: process.env.E2E_VAPID_PUBLIC_KEY, privateKey: process.env.E2E_VAPID_PRIVATE_KEY };
}
const vapid = testVapidKeys();

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
      // M27: test VAPID keys, so /alerte offers browser notifications (flags decide the rest), and
      // the bot's username (the token is worker-only).
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      TELEGRAM_BOT_USERNAME: E2E_TELEGRAM.username,
    },
  },
});
