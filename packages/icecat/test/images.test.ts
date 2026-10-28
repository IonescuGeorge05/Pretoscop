import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { DERIVATIVE_SIZES, icecatImageKeys, makeDerivatives } from '../src/index';

describe('image derivatives', () => {
  it('re-encodes to WebP within 1600 px and makes 120/400/800 px sizes, keeping the aspect ratio', async () => {
    const original = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const d = await makeDerivatives(original);
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect([d.width, d.height]).toEqual([1600, 800]);
    expect((await sharp(d.base).metadata()).format).toBe('webp');
    for (const size of DERIVATIVE_SIZES) {
      const m = await sharp(d.sizes[size]).metadata();
      expect(m.format).toBe('webp');
      expect([m.width, m.height]).toEqual([size, size / 2]);
    }
  });

  it('never enlarges a small picture', async () => {
    const small = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const d = await makeDerivatives(small);
    expect((await sharp(d.sizes[800]).metadata()).width).toBe(300);
    expect((await sharp(d.sizes[120]).metadata()).width).toBe(120);
  });

  it('rejects data that is not an image', async () => {
    await expect(makeDerivatives(Buffer.from('<html>not an image</html>'))).rejects.toThrow();
  });

  it('keys follow the web ProductImage convention (base + _120/_400/_800)', () => {
    const k = icecatImageKeys(42, 'ab'.repeat(32));
    expect(k.base).toBe('images/icecat/42/abababababababab.webp');
    expect(k.sizes[400]).toBe('images/icecat/42/abababababababab_400.webp');
  });
});
