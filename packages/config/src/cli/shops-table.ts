// Regenerates the registry table embedded in docs/06-retailer-targets.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { findRepoRoot } from '../env';
import { embedTable, loadShops, renderShopsTable } from '../shops/index';

const doc = `${findRepoRoot()}/docs/06-retailer-targets.md`;
const shops = loadShops();
const updated = embedTable(readFileSync(doc, 'utf8'), renderShopsTable(shops), new Date().toISOString().slice(0, 10));
writeFileSync(doc, updated);
console.log(`docs/06-retailer-targets.md: registry table updated (${shops.length} shops)`);
