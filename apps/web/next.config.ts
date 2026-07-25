import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@momentum/scheduler",
    "@capacitor/core",
    "@capacitor/app",
    "@capacitor/local-notifications",
    "@capacitor/network",
    "@capacitor/preferences",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
