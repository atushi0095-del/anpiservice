import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  "https://atushi0095-del-anpiservice-git-main-atushi0095-1704s-projects.vercel.app";

const config: CapacitorConfig = {
  appId: "jp.anpinote.app",
  appName: "あんぴノート",
  webDir: "public",
  server: {
    androidScheme: "https",
    url: serverUrl,
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
