import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@momentum/scheduler"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
