import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serwist (PWA) is layered in by Phase 1B via withSerwist().
  reactStrictMode: true,
};

export default nextConfig;

// OpenNext: make Cloudflare bindings (DB/KV/VECTORIZE/R2/EMAIL) available during
// `next dev` via getCloudflareContext(). No-op in production builds.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
