import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.anpinote.app",
  appName: "あんぴノート",
  webDir: "public",
  server: {
    androidScheme: "https",
    url: "https://atushi0095-del-anpiservice-git-main-atushi0095-1704s-projects.vercel.app",
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
