import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://pretoscop:pretoscop@localhost:5432/pretoscop',
  },
  strict: true,
  verbose: true,
});
