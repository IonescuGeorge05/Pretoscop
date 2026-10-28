/**
 * Builds the data-driven sitemaps into the blob store now (M16), read-only on the database.
 *   pnpm --filter @pretoscop/worker sitemap:build
 * URLs use PUBLIC_BASE_URL; the web app serves them at /sitemap.xml and /sitemaps/{file}.
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '@pretoscop/db';
import { createBlobStore } from '@pretoscop/storage';
import { buildSitemaps } from '../sitemap/build';

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const blob = createBlobStore(env);
  const m = await buildSitemaps({ db: createDb(pool), blob, baseUrl: env.PUBLIC_BASE_URL });
  console.log(JSON.stringify({ baseUrl: m.baseUrl, files: m.files, manifest: blob.describe('sitemaps/manifest.json') }));
} finally {
  await pool.end();
}
