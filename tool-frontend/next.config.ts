import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      // onnxruntime-node is a native addon for Node.js — Kokoro runs client-side only.
      // Aliasing to false prevents it from being traced into the server bundle.
      config.resolve.alias = { ...config.resolve.alias, "onnxruntime-node": false };
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    return config;
  },
};

export default nextConfig;
