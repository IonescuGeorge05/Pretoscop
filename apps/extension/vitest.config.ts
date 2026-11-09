import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The build-time constants of src/config.ts (build.ts defines them for real builds).
  define: {
    __PRETOSCOP_API_BASE__: JSON.stringify('https://pretoscop.ro'),
    __PRETOSCOP_SITE_BASE__: JSON.stringify('https://pretoscop.ro'),
  },
  test: { include: ['test/**/*.test.ts'] },
});
