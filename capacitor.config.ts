import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  "https://anpinote.vercel.app";

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
