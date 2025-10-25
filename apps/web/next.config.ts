import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly disable static export
  output: undefined,
  // Disable static optimization to prevent static page generation errors
  experimental: {
    staticGenerationRetryCount: 0,
  },
  // Disable generation of static error pages
  generateBuildId: async () => {
    return 'build-id'
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
