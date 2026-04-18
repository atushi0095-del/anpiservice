import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "家族防災ノート",
    short_name: "防災ノート",
    description: "平時の備えを整理し、いざという時の家族共有を簡単にするPWA。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf9",
    theme_color: "#147c72",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
