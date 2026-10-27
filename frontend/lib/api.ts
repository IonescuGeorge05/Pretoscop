// Folosit doar din componente server. Mod normal: API-ul FastAPI. Mod static: fișierele din public/data.
import type { Deals, History, ProductDetail, ProductList } from "./types";
import { IS_STATIC } from "./static";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export class NotFound extends Error {}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const res = await fetch(`${API}${path}${qs.size ? `?${qs}` : ""}`, { cache: "no-store" });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`API ${res.status} pentru ${path}`);
  return res.json() as Promise<T>;
}

async function readSnapshot<T>(rel: string): Promise<T> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    return JSON.parse(await readFile(join(process.cwd(), "public", "data", rel), "utf-8")) as T;
  } catch {
    throw new NotFound(rel);
  }
}

export const getProducts = (source?: string) =>
  IS_STATIC ? readSnapshot<ProductList>("products.json") : get<ProductList>("/api/products", { source });

export const getProduct = (slug: string, source?: string) =>
  IS_STATIC
    ? readSnapshot<ProductDetail>(`product/${slug}.json`)
    : get<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, { source });

export const getHistory = (slug: string, source?: string, range = "90d", granularity = "day") =>
  IS_STATIC
    ? readSnapshot<History>(`history/${slug}/${range}-${granularity}.json`)
    : get<History>(`/api/products/${encodeURIComponent(slug)}/history`, { source, range, granularity });

export const getDeals = (source?: string) =>
  IS_STATIC ? readSnapshot<Deals>("deals.json") : get<Deals>("/api/deals", { source });

export const getSnapshotMeta = () =>
  readSnapshot<{ generated_at: string; source: string }>("meta.json").catch(() => null);
