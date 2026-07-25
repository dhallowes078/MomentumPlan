import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.MOMENTUM_SERVER_URL || "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  appId: "app.momentum.plan",
  appName: "Momentum",
  webDir: "www",
  server: {
    // Load the Next.js app (dev: Android emulator → host machine).
    // Override with MOMENTUM_SERVER_URL for tunnel / production.
    url: serverUrl,
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#1f4d3a",
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
