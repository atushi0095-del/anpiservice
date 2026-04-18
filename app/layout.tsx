import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "安否確認ノート",
  description: "日常の見守りと家族の備えを整理し、いざという時の安否共有を簡単にするPWA。",
  appleWebApp: {
    capable: true,
    title: "安否確認ノート",
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
