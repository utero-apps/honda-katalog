import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://localhost:7780",
    "https://honda.maskhar.com",
  ]
};

export default nextConfig;
