import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: process.cwd() + "/../..",
  compress: false, // Preserve immediate SSE delivery through the local API proxy.
  experimental: { cpus: 1, proxyTimeout: 120000 },
  async rewrites() {
    return [
      {
        source: "/ws/:path*",
        destination: `${process.env.API_URL || "http://127.0.0.1:8000"}/ws/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://127.0.0.1:8000"}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
