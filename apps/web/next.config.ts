import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint runs as a dedicated zero-warning workspace check. Next 15 cannot
  // reliably detect the root flat config from this monorepo package.
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    "@stratin/execution",
    "@stratin/shared",
    "@stratin/strategy-engine",
  ],
};

export default nextConfig;
