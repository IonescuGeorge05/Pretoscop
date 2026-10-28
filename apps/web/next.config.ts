import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { NextConfig } from 'next';

// The repository keeps one `.env` at its root; load it for `next dev/build/start`.
function loadRootEnv(): void {
  let dir = resolve(process.cwd());
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const file = join(dir, '.env');
      if (existsSync(file)) {
        try {
          process.loadEnvFile(file);
        } catch {
          // ignore malformed files; getEnv() reports invalid values
        }
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadRootEnv();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Release id (set by the image build, M18): two replicas of one release share it, and a browser
  // holding pages of the previous release gets a full reload instead of mismatched assets.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ['@pretoscop/config', '@pretoscop/core', '@pretoscop/db', '@pretoscop/mailer', '@pretoscop/notify', '@pretoscop/report', '@pretoscop/storage'],
  serverExternalPackages: ['pg', '@aws-sdk/client-s3', '@aws-sdk/lib-storage'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
