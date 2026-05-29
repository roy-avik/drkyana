"use client";

import { useEffect } from "react";

/**
 * Registers the Serwist-generated service worker (/sw.js) so the Practice
 * Console is installable. @serwist/next auto-registers by default, but we also
 * guard here in case auto-register is disabled or the SW is generated at build
 * time only.
 */
export default function RegisterPWA() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; the app works without the SW */
      });
    }
  }, []);
  return null;
}
