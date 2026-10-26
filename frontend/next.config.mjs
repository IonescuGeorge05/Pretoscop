// Două moduri:
// - implicit: server Next.js (docker-compose), date live din API, proxy /api, admin;
// - STATIC_EXPORT=1: site static pentru GitHub Pages, date din public/data/*.json (snapshot exportat din API).
const isStatic = process.env.STATIC_EXPORT === "1";
// numele repo-ului pe GitHub Pages (ex. "Pretoscop" -> /Pretoscop); ultimul segment, ca să reziste conversiei
// de căi din Git Bash pe Windows ("/Pretoscop" -> "C:/Program Files/Git/Pretoscop")
const repo = (process.env.BASE_PATH ?? "").split(/[\\/]/).filter(Boolean).pop();
const basePath = repo ? `/${repo}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = isStatic
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      env: {
        NEXT_PUBLIC_STATIC: "1",
        NEXT_PUBLIC_BASE_PATH: basePath,
        NEXT_PUBLIC_NOINDEX: process.env.NOINDEX ?? "1",
      },
    }
  : {
      output: "standalone",
      reactStrictMode: true,
    };

export default nextConfig;
