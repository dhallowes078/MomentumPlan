import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  envPrefix: ["VITE_"],
  define: {
    "import.meta.env.VITE_MOBILE": JSON.stringify("1"),
    "import.meta.env.VITE_SYNC_API_URL": JSON.stringify(
      "https://momentum.momentum-app.workers.dev"
    ),
  },
  build: {
    outDir: "www",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../web/src"),
      "next/link": path.resolve(__dirname, "src/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "src/shims/next-navigation.ts"),
      "next-auth/react": path.resolve(__dirname, "src/shims/next-auth.tsx"),
      "next/font/google": path.resolve(__dirname, "src/shims/next-font.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
