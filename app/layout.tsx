import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = "ここシェア";

export const metadata: Metadata = {
  title: appName,
  description: "安否確認と時間限定の位置シェアを、日常にも災害時にも使いやすくまとめたPWAです。",
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
