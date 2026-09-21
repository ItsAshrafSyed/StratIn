import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@stratin/execution", "@stratin/shared", "@stratin/strategy-engine"]
};

export default nextConfig;
