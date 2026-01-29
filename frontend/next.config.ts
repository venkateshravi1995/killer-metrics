import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  webpack: (config) => {
    const frontendNodeModules = path.resolve(__dirname, "node_modules");

    if (!config.resolve) {
      config.resolve = { modules: [frontendNodeModules, "node_modules"] };
      return config;
    }

    const modules = config.resolve.modules;
    if (!modules) {
      config.resolve.modules = [frontendNodeModules, "node_modules"];
      return config;
    }

    if (Array.isArray(modules)) {
      if (!modules.includes(frontendNodeModules)) {
        config.resolve.modules = [frontendNodeModules, ...modules];
      }
      return config;
    }

    config.resolve.modules = [frontendNodeModules, modules];
    return config;
  },
};

export default nextConfig;
