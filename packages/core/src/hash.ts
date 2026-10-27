/**
 * SHA-256 content hash of an offer (`@pretoscop/core/hash`). Uses `node:crypto`, so it is exported
 * only from this sub-path, never from the package root: browser bundles must not pull Node crypto.
 *
 *   import { contentHash } from '@pretoscop/core/hash';
 *   const n = normalizeOffer(raw, { shop, observedAt, hash: contentHash });
 */
import { createHash } from 'node:crypto';
import { type ContentHashFields, contentHashInput } from './content-hash';

export { CONTENT_HASH_VERSION, contentHashInput } from './content-hash';
export type { ContentHasher, ContentHashFields } from './content-hash';

/** Lower-case hex SHA-256 of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** `sha256Hex(contentHashInput(fields))`: the value stored in `offers.content_hash`. */
export function contentHash(fields: ContentHashFields): string {
  return sha256Hex(contentHashInput(fields));
}
