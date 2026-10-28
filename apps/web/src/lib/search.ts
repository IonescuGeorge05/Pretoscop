import 'server-only';
import { createMeili, indexNames, type IndexNames, type Meili } from '@pretoscop/search';
import { serverEnv } from './db';

// One keep-alive client per server process (kept on globalThis across dev hot reloads).
const g = globalThis as unknown as { __pretoscopMeili?: Meili };

/** Meilisearch with the search-only key when one is configured (production), else the master key (dev). */
export function meili(): Meili {
  if (!g.__pretoscopMeili) {
    const env = serverEnv();
    g.__pretoscopMeili = createMeili({ url: env.MEILI_URL, apiKey: env.MEILI_SEARCH_KEY ?? env.MEILI_MASTER_KEY, timeoutMs: 5000 });
  }
  return g.__pretoscopMeili;
}

export function names(): IndexNames {
  return indexNames(serverEnv().MEILI_INDEX_PREFIX);
}

/** Meilisearch filter value, quoted (slugs are validated before they get here). */
export function q(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
