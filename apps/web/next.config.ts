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
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-d1",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
