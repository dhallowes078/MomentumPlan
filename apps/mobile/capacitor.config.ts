import type { CapacitorConfig } from "@capacitor/cli";

// Physical device: phone must reach this URL on your LAN (or a Cloudflare tunnel).
// Emulator: use http://10.0.2.2:3000
const serverUrl =
  process.env.MOMENTUM_SERVER_URL || "http://192.168.4.164:3000";

const config: CapacitorConfig = {
  appId: "app.momentum.plan",
  appName: "Momentum",
  webDir: "www",
  server: {
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
