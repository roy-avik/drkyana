import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Serwist (PWA): compiles app/sw.ts → public/sw.js with a precache manifest and
// makes the admin app installable. Serwist is a webpack plugin, so the build
// must run with webpack (see the "build" script: `next build --webpack`).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Don't break local `next dev` (Turbopack) — only generate the SW for builds.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);

// OpenNext: make Cloudflare bindings (DB/KV/VECTORIZE/R2/EMAIL) available during
// `next dev` via getCloudflareContext(). No-op in production builds.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
