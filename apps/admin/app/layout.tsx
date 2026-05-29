import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import Nav from "./components/Nav";
import RegisterPWA from "./components/RegisterPWA";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dr Kyana — Practice Console",
  description: "Clinical management console (authorized access only).",
  applicationName: "Dr Kyana — Practice Console",
  appleWebApp: {
    capable: true,
    title: "Practice Console",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f4c81",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterPWA />
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-5 pb-24">{children}</main>
      </body>
    </html>
  );
}
