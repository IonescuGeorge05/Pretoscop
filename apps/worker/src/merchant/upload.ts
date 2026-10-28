import { FetchError, gunzipFile, isGzipMagic } from '@pretoscop/fetch';
import type { BlobStore } from '@pretoscop/storage';

/** A feed file larger than the cap (before or after gunzip). */
export class FeedTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`feed file exceeds ${limitBytes} bytes (decoded)`);
    this.name = 'FeedTooLargeError';
  }
}

/**
 * Reads a feed file a merchant uploaded (M20) from the blob store, gunzipped when it is a .gz, never
 * more than `maxBytes` after decoding: the same cap as a feed fetched by URL, through the same capped
 * decoder, so a small gzip bomb cannot expand to gigabytes in the worker. Null when the file is gone.
 */
export async function readUploadedFeed(blob: BlobStore, key: string, maxBytes: number): Promise<Uint8Array | null> {
  const data = await blob.get(key);
  if (!data) return null;
  if (data.byteLength > maxBytes) throw new FeedTooLargeError(maxBytes);
  if (!isGzipMagic(data)) return data;
  try {
    return (await gunzipFile(Buffer.from(data.buffer, data.byteOffset, data.byteLength), maxBytes)).data;
  } catch (err) {
    if (err instanceof FetchError && err.fetchCode === 'body_too_large') throw new FeedTooLargeError(maxBytes);
    throw err;
  }
}
