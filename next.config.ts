import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disables the Turbopack "flying shuttle" incremental cache which causes
    // intermittent PageNotFoundError (ENOENT) race conditions during builds.
    turbopackFlyingShuttle: false,
  },
};

export default nextConfig;
