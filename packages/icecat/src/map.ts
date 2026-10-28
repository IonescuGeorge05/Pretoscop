/**
 * Pure mapping of an Open Icecat JSON product response to what Pretoscop stores: the
 * `product_specs.data` document and the list of gallery images that may be copied. No I/O.
 */
import type {
  IcecatFeature,
  IcecatImageRef,
  IcecatLocalized,
  IcecatProductResponse,
  MappedIcecatProduct,
  SpecFeature,
} from './types';

/** At most this many gallery images per product are copied (main image first). */
export const MAX_IMAGES = 6;

const text = (v: unknown): string | null => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};

const localized = (v: IcecatLocalized | undefined): string | null => text(v?.Value);

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function unitOf(f: IcecatFeature, lang: string): string {
  const signs = f.Feature?.Measure?.Signs;
  const sign =
    (signs && (signs[lang.toUpperCase()] ?? signs[lang.toLowerCase()] ?? signs._)) ??
    f.Feature?.Measure?.Sign ??
    f.Feature?.Sign;
  return text(sign) ?? '';
}

/** True when a response carries a product datasheet (not an error document). */
export function isProductResponse(json: unknown): json is IcecatProductResponse {
  if (typeof json !== 'object' || json === null) return false;
  const data = (json as IcecatProductResponse).data;
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.GeneralInfo === 'object' &&
    data.GeneralInfo !== null
  );
}

/**
 * Maps a product response. `lang` is the requested language (`RO`, `EN`); `matched` says which
 * lookup found it. Features keep Icecat's group and sort order; a feature without a name or a
 * value is dropped. Images: public product pictures only (`IsPrivate` false), main first, at most
 * `MAX_IMAGES`; without a gallery the general `Image.HighPic` is used.
 */
export function mapIcecatProduct(
  json: IcecatProductResponse,
  lang: string,
  matched: { by: 'gtin' | 'brand_mpn'; key: string },
): MappedIcecatProduct {
  const data = json.data ?? {};
  const g = data.GeneralInfo ?? {};
  const features: SpecFeature[] = [];
  const groups = [...(data.FeaturesGroups ?? [])].sort((a, b) => (a.SortNo ?? 0) - (b.SortNo ?? 0));
  for (const group of groups) {
    const groupName = localized(group.FeatureGroup?.Name) ?? '';
    const list = [...(group.Features ?? [])].sort((a, b) => (a.SortNo ?? 0) - (b.SortNo ?? 0));
    for (const f of list) {
      const name = localized(f.Feature?.Name);
      const value = text(f.PresentationValue) ?? text(f.LocalValue) ?? text(f.Value);
      if (!name || !value) continue;
      const row: SpecFeature = { group: groupName, name, value, unit: unitOf(f, lang) };
      const raw = text(f.RawValue) ?? text(f.Value);
      if (raw && raw !== value) row.raw = raw;
      if (f.Type) row.type = f.Type;
      features.push(row);
    }
  }

  const gallery = (data.Gallery ?? [])
    .filter(
      (img) => img.IsPrivate !== true && (img.Type === undefined || img.Type === 'ProductImage'),
    )
    .map((img, i) => ({
      url: text(img.Pic) ?? text(img.Pic500x500) ?? text(img.LowPic),
      icecatImageId: text(img.ID),
      width: num(img.PicWidth),
      height: num(img.PicHeight),
      isMain: img.IsMain === 'Y',
      position: num(img.No) ?? i + 1,
    }))
    .filter((img): img is IcecatImageRef => img.url !== null)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.position - b.position);
  let images: IcecatImageRef[] = gallery.slice(0, MAX_IMAGES);
  const high = text(data.Image?.HighPic);
  if (images.length === 0 && high) {
    images = [
      {
        url: high,
        icecatImageId: null,
        width: num(data.Image?.HighPicWidth),
        height: num(data.Image?.HighPicHeight),
        isMain: true,
        position: 1,
      },
    ];
  }

  return {
    specs: {
      locale: lang.toLowerCase(),
      features,
      summary:
        text(g.SummaryDescription?.LongSummaryDescription) ??
        text(g.SummaryDescription?.ShortSummaryDescription),
      shortSummary: text(g.SummaryDescription?.ShortSummaryDescription),
      marketingText: text(g.Description?.LongDesc),
      bulletPoints: (g.BulletPoints?.Values ?? [])
        .map((v) => text(v))
        .filter((v): v is string => v !== null),
      title: text(g.Title),
      brand: text(g.Brand),
      productName: text(g.ProductName),
      mpn: text(g.BrandPartCode),
      gtins: (g.GTIN ?? []).map((v) => text(v)).filter((v): v is string => v !== null),
      category: localized(g.Category?.Name),
      icecatId: text(g.IcecatId),
      quality: text(g.Quality),
      releaseDate: text(g.ReleaseDate),
      matchedBy: matched.by,
      matchedKey: matched.key,
      demoAccount: data.DemoAccount === true,
      source: 'open-icecat',
    },
    images,
  };
}

/** A response with neither features nor a summary is not worth storing in that language. */
export function hasContent(m: MappedIcecatProduct): boolean {
  return m.specs.features.length > 0 || m.specs.summary !== null;
}
