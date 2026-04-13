import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "あんぴノート",
  description: "離れて暮らす家族へ、毎日の無事をやさしく届ける見守りPWA。",
  appleWebApp: {
    capable: true,
    title: "あんぴノート",
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
