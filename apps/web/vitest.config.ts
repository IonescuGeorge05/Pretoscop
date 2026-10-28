import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Throwaway databases (createTestDatabase) can take > 10 s to create when Postgres is busy.
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], exclude: ['e2e/**'], hookTimeout: 180_000 },
});
