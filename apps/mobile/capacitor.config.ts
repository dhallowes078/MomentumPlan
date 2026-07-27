import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.momentum.plan",
  appName: "Momentum",
  webDir: "www",
  // No server.url — the APK loads the bundled SPA from www/.
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#1f4d3a",
    },
    StatusBar: {
      // Ignored on Android 15+ (edge-to-edge enforced); CSS safe-area handles insets.
      overlaysWebView: true,
      style: "LIGHT",
    },
    SystemBars: {
      insetsHandling: "css",
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
