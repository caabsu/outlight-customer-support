import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix for monorepo - tell Next.js where the root is
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    // Use environment variable for API URL, fallback to localhost for development
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
