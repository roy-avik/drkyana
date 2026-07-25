import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import Nav from "./components/Nav";
import RegisterPWA from "./components/RegisterPWA";
import ApplyDlsTokens from "./components/ApplyDlsTokens";
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
      <head>
        {/* Brand fonts (docs/dls.md's "font-sans" token: Poppins primary,
            Vazirmatn/Noto Sans Bengali as glyph fallbacks — patient data
            shown here, e.g. a name or transcript, can contain Farsi/Bengali
            characters even though the admin UI chrome is English-only).
            Same Google Fonts approach as the patient site (index.html). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&family=Vazirmatn:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <RegisterPWA />
        <ApplyDlsTokens />
        <Nav />
        <main id="main-content" className="mx-auto max-w-3xl px-4 py-5 pb-24 lg:max-w-5xl">
          {children}
        </main>
      </body>
    </html>
  );
}
