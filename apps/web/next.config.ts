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

const originOf = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * Content Security Policy (M16; docs/03 §10). Headers are fixed at build time, like the
 * NEXT_PUBLIC_* values they read: the Plausible origin (loaded only after consent, M12/M17) and the
 * licensed-image origin. Next.js streams its RSC payload in inline scripts, so script-src needs
 * 'unsafe-inline' unless every page became dynamic for nonces; no third-party script can load.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== 'production';
  const plausible = originOf(process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL);
  const media = originOf(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
  const extra = (...v: Array<string | null | false>) => v.filter(Boolean).map((s) => ` ${s}`).join('');
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${extra(dev && "'unsafe-eval'", plausible)}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra(media)}`,
    "font-src 'self'",
    `connect-src 'self'${extra(plausible, dev && 'ws:')}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'Content-Language', value: 'ro-RO' },
  // TDM reservation (Law 8/1996 art. 36², Directive 2019/790 art. 4(3)); see /.well-known/tdmrep.json.
  { key: 'tdm-reservation', value: '1' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ['@pretoscop/config', '@pretoscop/core', '@pretoscop/db', '@pretoscop/mailer', '@pretoscop/notify', '@pretoscop/report', '@pretoscop/search', '@pretoscop/storage'],
  serverExternalPackages: ['pg', '@aws-sdk/client-s3'],
  async redirects() {
    // `/c` alone has no page: the category index lives at /categorii.
    return [{ source: '/c', destination: '/categorii', permanent: true }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
