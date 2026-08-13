import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build-while-serving: deploys build into a fresh dist dir (NEXT_DIST=.next-new)
  // while the running server keeps serving the old one, then we swap + restart.
  distDir: process.env.NEXT_DIST || ".next",
};

export default nextConfig;
