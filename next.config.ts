import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local preview sets NEXT_DIST_DIR so `next build` runs by agents can't clobber the dev server's output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // The app reads cookies, so every page is dynamic. Keep visited tabs in the client
    // router cache so switching Feed/Explore/Profiles doesn't hit the server each time.
    staleTimes: { dynamic: 300, static: 300 },
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
