import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/explore",
        destination: "/",
        permanent: true,
      },
    ];
  },
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
