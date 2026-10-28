/**
 * Open Icecat Live JSON API (`https://live.icecat.biz/api?lang=RO&shopname=<user>&GTIN=…`), the
 * subset Pretoscop reads. Field names follow Icecat's "Manual for Icecat JSON Product Requests"
 * (v3.0, 13 Oct 2026); every field is optional here because Icecat omits empty ones.
 */
export interface IcecatLocalized {
  ID?: number | string;
  Value?: string;
  Language?: string;
}

export interface IcecatFeature {
  ID?: number | string;
  Type?: string;
  Value?: string;
  RawValue?: string;
  PresentationValue?: string;
  LocalValue?: string;
  SortNo?: number;
  Feature?: {
    ID?: number | string;
    Sign?: string;
    Measure?: { ID?: number | string; Sign?: string; Signs?: Record<string, string> };
    Name?: IcecatLocalized;
  };
}

export interface IcecatFeatureGroup {
  ID?: number | string;
  SortNo?: number;
  FeatureGroup?: { ID?: number | string; Name?: IcecatLocalized };
  Features?: IcecatFeature[];
}

export interface IcecatGalleryImage {
  ID?: number | string;
  Pic?: string;
  Pic500x500?: string;
  LowPic?: string;
  ThumbPic?: string;
  PicWidth?: number | string;
  PicHeight?: number | string;
  Size?: number | string;
  No?: number | string;
  IsMain?: string;
  IsPrivate?: boolean;
  Type?: string;
  Updated?: string;
}

export interface IcecatGeneralInfo {
  IcecatId?: number | string;
  ReleaseDate?: string;
  Title?: string;
  Brand?: string;
  ProductName?: string;
  BrandPartCode?: string;
  GTIN?: string[];
  Category?: { CategoryID?: string | number; Name?: IcecatLocalized };
  ProductFamily?: IcecatLocalized;
  ProductSeries?: IcecatLocalized;
  Description?: {
    LongDesc?: string;
    MiddleDesc?: string;
    Disclaimer?: string;
    Language?: string;
    LeafletPDFURL?: string;
    ManualPDFURL?: string;
  };
  SummaryDescription?: { ShortSummaryDescription?: string; LongSummaryDescription?: string };
  BulletPoints?: { Values?: string[]; Language?: string };
  Quality?: string;
}

export interface IcecatProductResponse {
  msg?: string;
  data?: {
    GeneralInfo?: IcecatGeneralInfo;
    Image?: {
      HighPic?: string;
      HighPicWidth?: number | string;
      HighPicHeight?: number | string;
      Pic500x500?: string;
      LowPic?: string;
      ThumbPic?: string;
    };
    Gallery?: IcecatGalleryImage[];
    FeaturesGroups?: IcecatFeatureGroup[];
    DemoAccount?: boolean;
  };
}

/** One feature row of `product_specs.data.features` (interface contract of M11). */
export interface SpecFeature {
  group: string;
  name: string;
  /** Icecat's presentation value in the requested language ("39,6 cm (15.6\")"). */
  value: string;
  /** Measure sign ("cm", "GB", "\""), empty when the feature has none. */
  unit: string;
  /** Machine value when Icecat gives one ("15.6"). */
  raw?: string;
  type?: string;
}

/**
 * `product_specs.data` for `source = 'icecat'` (interface contract of M11):
 * `{ features: [{group, name, value, unit}], summary, locale }` plus provenance and identity fields.
 * Icecat texts are stored exactly as received (Open Content Licence §2: changes must be marked);
 * presentation fixes (diacritics) belong to the display layer.
 */
export interface IcecatSpecsData {
  locale: string;
  features: SpecFeature[];
  summary: string | null;
  shortSummary: string | null;
  /** Marketing text (often empty in Romanian; HTML as Icecat sends it). */
  marketingText: string | null;
  bulletPoints: string[];
  title: string | null;
  brand: string | null;
  productName: string | null;
  mpn: string | null;
  gtins: string[];
  category: string | null;
  icecatId: string | null;
  quality: string | null;
  releaseDate: string | null;
  /** How the datasheet was found. */
  matchedBy: 'gtin' | 'brand_mpn';
  /** The lookup key that found it (GTIN or "Brand ProductCode"). */
  matchedKey: string;
  demoAccount: boolean;
  source: 'open-icecat';
}

/** A gallery image Pretoscop may copy (Open Icecat licence, with attribution). */
export interface IcecatImageRef {
  url: string;
  icecatImageId: string | null;
  width: number | null;
  height: number | null;
  isMain: boolean;
  position: number;
}

export interface MappedIcecatProduct {
  specs: IcecatSpecsData;
  images: IcecatImageRef[];
}
