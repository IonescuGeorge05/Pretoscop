/**
 * Founder check of GTIN validation.
 *
 *   pnpm --filter @pretoscop/core gtin 0711719577034
 *   pnpm --filter @pretoscop/core gtin 0000000000000 2073519482603 "590 1234 12345 8"
 */
import { validateGtin } from '../index';

function main(): number {
  const inputs = process.argv.slice(2).filter((a) => a !== '--');
  if (inputs.length === 0) {
    console.error('usage: pnpm --filter @pretoscop/core gtin <code> [<code> …]');
    return 2;
  }
  for (const input of inputs) {
    const r = validateGtin(input);
    const details = [
      `quality=${r.quality}`,
      `gtin14=${r.gtin14 ?? '–'}`,
      ...(r.kind ? [`kind=${r.kind}`] : []),
      ...(r.reason ? [`reason=${r.reason}`] : []),
      ...(r.bookland ? ['bookland=true'] : []),
      ...(r.convertedFrom ? [`convertedFrom=${r.convertedFrom}`] : []),
    ];
    console.log(`${input}  →  ${details.join('  ')}`);
    console.log(JSON.stringify({ input, ...r }));
  }
  return 0;
}

process.exitCode = main();
