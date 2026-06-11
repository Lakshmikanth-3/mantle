import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/monitor/:path*",
        destination: "http://localhost:3005/monitor/:path*",
      },
      {
        source: "/monitor",
        destination: "http://localhost:3005/monitor",
      },
    ];
  },
};

export default nextConfig;
