import type { ReactNode } from "react";

export const metadata = {
  title: "Dr Kyana — Practice Console",
  description: "Clinical management console (authorized access only).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
