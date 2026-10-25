// Folosit doar din componente server (SSR); componentele client trec prin proxy-ul /api.
import type { History, ProductDetail, ProductList } from "./types";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export class NotFound extends Error {}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const res = await fetch(`${API}${path}${qs.size ? `?${qs}` : ""}`, { cache: "no-store" });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`API ${res.status} pentru ${path}`);
  return res.json() as Promise<T>;
}

export const getProducts = (source?: string) => get<ProductList>("/api/products", { source });

export const getProduct = (slug: string, source?: string) =>
  get<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, { source });

export const getHistory = (slug: string, source?: string, range = "90d", granularity = "day") =>
  get<History>(`/api/products/${encodeURIComponent(slug)}/history`, { source, range, granularity });
