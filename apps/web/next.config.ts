import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix for monorepo - tell Next.js where the root is
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
