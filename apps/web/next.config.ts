import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: process.cwd() + "/../..",
  compress: true, // SSE uses Cache-Control: no-transform; ordinary assets remain compressed.
  experimental: { cpus: 1, proxyTimeout: 120000 },
  async rewrites() {
    return [
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
