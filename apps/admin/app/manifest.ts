import type { MetadataRoute } from "next";

/**
 * PWA manifest for the admin app — makes the Practice Console installable as
 * Dr Kyana's phone app (it replaces AppSheet). Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dr Kyana — Practice Console",
    short_name: "Practice Console",
    description:
      "Clinical management console for Dr Kyana — intake queue, status workflow, chambers, drafts, and the assistant.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0f4c81",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
