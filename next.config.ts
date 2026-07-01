import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 pulls in pdfjs-dist, which resolves its worker file
  // (pdf.worker.mjs) at runtime relative to its own package location.
  // Turbopack's server bundler was inlining pdfjs-dist and losing the
  // worker asset, so we mark both as external — they'll be loaded from
  // node_modules by the running server process, worker and all.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
