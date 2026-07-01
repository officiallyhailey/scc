import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Pin the workspace root to this project. Without it, Next infers the root from the nearest
  // lockfile and picks the stray ~/package-lock.json in the home dir (see the multi-lockfile
  // warning). This keeps file tracing / HMR scoped to eosapp/scc.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
