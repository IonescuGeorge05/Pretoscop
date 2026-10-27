import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Romanian correctness (CLAUDE.md): comma-below ș ț only. Scans the sources of the legal and trust
 * pages (M17), their components and libraries, and the UI messages; the e2e suite checks the
 * rendered text. Other modules' code (e.g. a normalizer that maps ş → ș) is deliberately not scanned.
 */
const SRC = fileURLToPath(new URL('../..', import.meta.url));
const PAGES = ['despre', 'cum-functioneaza', 'cum-castigam-bani', 'metodologie', 'pentru-magazine', 'bot', 'contact', 'termeni', 'confidentialitate', 'cookies', 'accesibilitate'];
const PATHS = [
  ...PAGES.map((p) => join('app', '(site)', p)),
  'app/api/contact',
  'app/bot',
  'components/legal',
  'components/contact',
  'components/consent',
  'lib/contact.ts',
  'lib/coverage.ts',
  'lib/legal.ts',
  'lib/bot-policy.ts',
  'lib/consent-storage.ts',
  'messages',
];
const CEDILLA = /[şţŞŢ]/;

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => (/\.(tsx?|json)$/.test(name) || statSync(join(path, name)).isDirectory() ? files(join(path, name)) : []));
}

describe('legal and trust sources', () => {
  it('exist for every page linked from the footer', () => {
    for (const page of PAGES) expect(existsSync(join(SRC, 'app', '(site)', page, 'page.tsx')), page).toBe(true);
  });

  it('contain no cedilla diacritics (ş ţ)', () => {
    const all = PATHS.flatMap((p) => files(join(SRC, p)));
    expect(all.length).toBeGreaterThan(20);
    for (const file of all) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          expect(CEDILLA.test(line), `${relative(SRC, file)}:${i + 1}: ${line.trim()}`).toBe(false);
        });
    }
  });
});
