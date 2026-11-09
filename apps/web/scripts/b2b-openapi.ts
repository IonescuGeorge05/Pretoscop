/**
 * Writes the B2B API contract (M28) to docs/api/b2b-v1.openapi.json from the zod schemas in
 * src/lib/b2b-api-schema.ts. Run after changing the API: `pnpm --filter @pretoscop/web b2b:openapi`.
 * The test in src/lib/__tests__/b2b-api.test.ts fails while the committed file differs.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApiDocument } from '../src/lib/b2b-api-schema';

const out = fileURLToPath(new URL('../../../docs/api/b2b-v1.openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`wrote ${out}`);
