/**
 * Server start check (M16). Pages prerendered by `next build` (the trust and legal pages, the home
 * page until its first revalidation) bake in the root metadata of that moment: robots
 * (`SITE_INDEXABLE`) and the absolute canonical, hreflang and Open Graph URLs (`PUBLIC_BASE_URL`).
 * A build made for one environment and started in another would serve them wrong: closed pages on
 * the open site, or the open site's canonicals on staging. next.config.ts records the build's values;
 * here the server compares them with its own. In staging and production a mismatch stops the server;
 * elsewhere it is a warning.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getEnv } = await import('@pretoscop/config/env');
  const env = getEnv();
  const truthy = (v: string | undefined) => ['1', 'true', 'yes', 'on'].includes((v ?? '').trim().toLowerCase());
  const built = {
    SITE_INDEXABLE: truthy(process.env.PRETOSCOP_BUILD_SITE_INDEXABLE),
    PUBLIC_BASE_URL: (process.env.PRETOSCOP_BUILD_PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
  };
  const running = { SITE_INDEXABLE: env.SITE_INDEXABLE, PUBLIC_BASE_URL: env.PUBLIC_BASE_URL.replace(/\/+$/, '') };
  const differ = (Object.keys(built) as Array<keyof typeof built>).filter((k) => built[k] !== running[k]);
  if (differ.length === 0) return;
  const message = `This build was made with ${differ.map((k) => `${k}=${built[k]}`).join(', ')} but runs with ${differ
    .map((k) => `${k}=${running[k]}`)
    .join(', ')}: prerendered pages would carry the build's robots and URLs. Build with the environment's values.`;
  if (env.APP_ENV === 'staging' || env.APP_ENV === 'prod') throw new Error(message);
  console.warn(JSON.stringify({ level: 'warn', service: 'web', msg: message }));
}
