import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Disable static optimization to prevent static page generation errors
  experimental: {
    staticGenerationRetryCount: 0,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
};

export default nextConfig;
