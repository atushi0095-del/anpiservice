import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ここシェア",
    short_name: "ここシェア",
    description: "安否確認と時間限定の位置シェアをまとめて使えるPWAです。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf9",
    theme_color: "#147c72",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
