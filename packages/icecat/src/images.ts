/**
 * Image derivatives for licensed Icecat pictures (ADR-008): our own copies in the blob store,
 * never hotlinked. Keys follow the web's `ProductImage` convention: `storage_key` =
 * `images/icecat/<productId>/<sha16>.webp`, sizes at `…_120.webp`, `…_400.webp`, `…_800.webp`.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const DERIVATIVE_SIZES = [120, 400, 800] as const;
export type DerivativeSize = (typeof DERIVATIVE_SIZES)[number];
/** The stored base image is capped at this size (the web never needs more). */
export const BASE_MAX = 1600;

export interface ImageDerivatives {
  /** sha256 of the downloaded original (dedupe across refreshes). */
  sha256: string;
  width: number;
  height: number;
  base: Buffer;
  sizes: Record<DerivativeSize, Buffer>;
}

/** Decodes, auto-rotates and re-encodes to WebP: a base (≤ 1600 px) and square-bounded sizes. */
export async function makeDerivatives(bytes: Uint8Array): Promise<ImageDerivatives> {
  const input = Buffer.from(bytes);
  const sha256 = createHash('sha256').update(input).digest('hex');
  const meta = await sharp(input, { failOn: 'error' }).metadata();
  if (!meta.width || !meta.height) throw new Error('image without dimensions');
  const base = await sharp(input)
    .rotate()
    .resize({ width: BASE_MAX, height: BASE_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const sizes = {} as Record<DerivativeSize, Buffer>;
  for (const size of DERIVATIVE_SIZES) {
    sizes[size] = await sharp(input)
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: size <= 120 ? 75 : 82 })
      .toBuffer();
  }
  return { sha256, width: base.info.width, height: base.info.height, base: base.data, sizes };
}

/** Format and size of an image (checks of stored derivatives). */
export async function imageInfo(
  bytes: Uint8Array,
): Promise<{ format: string | undefined; width: number | undefined; height: number | undefined }> {
  const m = await sharp(Buffer.from(bytes)).metadata();
  return { format: m.format, width: m.width, height: m.height };
}

export interface ImageKeys {
  base: string;
  sizes: Record<DerivativeSize, string>;
}

/** Blob keys of one Icecat image of a product. */
export function icecatImageKeys(productId: number, sha256: string): ImageKeys {
  const base = `images/icecat/${productId}/${sha256.slice(0, 16)}.webp`;
  const sizes = {} as Record<DerivativeSize, string>;
  for (const size of DERIVATIVE_SIZES) sizes[size] = base.replace(/\.webp$/, `_${size}.webp`);
  return { base, sizes };
}
