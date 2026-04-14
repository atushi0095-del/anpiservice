import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "あんぴノート",
    short_name: "あんぴ",
    description: "離れて暮らす家族へ、毎日の無事をやさしく届ける見守りPWA。",
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
