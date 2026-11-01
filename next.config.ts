import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.22.39.175', '10.22.39.175:3000'],
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
