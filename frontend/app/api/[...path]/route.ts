// Proxy către API-ul FastAPI (rețea internă docker). Componentele client cheamă /api/... pe același origin.
import type { NextRequest } from "next/server";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const url = `${API}/api/${params.path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of ["user-agent", "referer", "x-admin-token", "content-type"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : await req.text(),
    redirect: "manual",
    cache: "no-store",
  });
  const out = new Headers();
  for (const h of ["content-type", "location"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST };
