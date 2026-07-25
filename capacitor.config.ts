import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  "https://anpinote.vercel.app";

const config: CapacitorConfig = {
  appId: "com.ajuworks.kokoshare",
  appName: "ここシェア",
  webDir: "public",
  android: {
    includePlugins: ["@capacitor/share"]
  },
  server: {
    androidScheme: "https",
    url: serverUrl,
    cleartext: false
  }
};

export default config;
