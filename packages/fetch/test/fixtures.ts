import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Fixtures under test/fixtures/ are synthetic (hand-written), see the package README. */
export const fixturePath = (...parts: string[]) =>
  fileURLToPath(new URL(`./fixtures/${parts.join('/')}`, import.meta.url));

export const readFixture = (...parts: string[]) => readFileSync(fixturePath(...parts), 'utf8');
