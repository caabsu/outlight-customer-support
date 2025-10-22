import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
  // Increase server timeout for AI operations
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Increase API route timeout
  serverRuntimeConfig: {
    apiTimeout: 300000, // 5 minutes
  },
};

export default nextConfig;
