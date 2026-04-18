import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家族防災ノート",
  description: "平時の備えを整理し、いざという時の家族共有を簡単にするPWA。",
  appleWebApp: {
    capable: true,
    title: "家族防災ノート",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#147c72",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
