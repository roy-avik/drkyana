import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // OAuth discovery documents live at RFC-mandated /.well-known paths, which
  // the app router can't host directly — rewrite them onto API routes. The
  // :path* variants cover the path-suffixed forms (RFC 8414 §3 / RFC 9728 §3),
  // e.g. /.well-known/oauth-protected-resource/api/mcp.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/resource",
      },
    ];
  },
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
// `next dev` via getCloudflareContext(). Guard on dev — at module load this also
// runs during `next build`, where `remote: true` bindings try to open a remote
// proxy session to Cloudflare and fail in CI (no auth). Only needed for `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
