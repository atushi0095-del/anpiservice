import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "いまここ安否ノート",
    short_name: "いまここ安否",
    description: "安否共有、防災メモ、ここシェアをまとめて使えるPWAです。",
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
