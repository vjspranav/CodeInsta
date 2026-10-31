import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The app reads cookies, so every page is dynamic. Keep visited tabs in the client
    // router cache so switching Feed/Explore/Profiles doesn't hit the server each time.
    staleTimes: { dynamic: 300, static: 300 },
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
