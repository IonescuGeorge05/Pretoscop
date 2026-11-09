import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { NextConfig } from 'next';
import { contentSecurityPolicy } from './src/lib/csp';

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

/**
 * Content Security Policy (M16, M25): see src/lib/csp.ts. Headers are fixed at build time, like
 * the NEXT_PUBLIC_* values they read (Plausible, licensed images, the optional AdSense publisher).
 */
const csp = contentSecurityPolicy({
  dev: process.env.NODE_ENV !== 'production',
  plausibleScriptUrl: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
  mediaBaseUrl: process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
});

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Content-Language', value: 'ro-RO' },
  // TDM reservation (Law 8/1996 art. 36², Directive 2019/790 art. 4(3)); see /.well-known/tdmrep.json.
  { key: 'tdm-reservation', value: '1' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Release id (set by the image build, M18): two replicas of one release share it, and a browser
  // holding pages of the previous release gets a full reload instead of mismatched assets.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ['@pretoscop/config', '@pretoscop/core', '@pretoscop/db', '@pretoscop/fetch', '@pretoscop/icecat', '@pretoscop/mailer', '@pretoscop/notify', '@pretoscop/payments', '@pretoscop/report', '@pretoscop/search', '@pretoscop/storage'],
  serverExternalPackages: ['pg', '@aws-sdk/client-s3', '@aws-sdk/lib-storage'],
  // What prerendered pages bake in (root metadata: robots and absolute URLs), inlined at build time;
  // src/instrumentation.ts compares them with the running server's environment (M16).
  env: {
    PRETOSCOP_BUILD_SITE_INDEXABLE: process.env.SITE_INDEXABLE ?? 'false',
    PRETOSCOP_BUILD_PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  },
  async redirects() {
    // `/c` alone has no page: the category index lives at /categorii.
    return [{ source: '/c', destination: '/categorii', permanent: true }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // M27: the service worker is never cached (browser, Cloudflare), so a fixed version reaches
      // every browser at its next visit; it may control the whole site (scope '/').
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
