import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = "いまここ安否ノート";

export const metadata: Metadata = {
  title: appName,
  description: "防災メモと時間限定の位置共有をまとめ、日常にも災害時にも使いやすくしたPWAです。",
  appleWebApp: {
    capable: true,
    title: appName,
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
