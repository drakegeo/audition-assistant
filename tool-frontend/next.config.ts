import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's file tracer (@vercel/nft) walks node_modules statically and would
  // pull in onnxruntime-node (404 MB native addon) even though Kokoro TTS runs
  // entirely client-side. Excluding here keeps serverless functions under 250 MB.
  outputFileTracingExcludes: {
    "*": ["./node_modules/onnxruntime-node/**", "./node_modules/@img/**"],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.resolve.alias = { ...config.resolve.alias, "onnxruntime-node": false };
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    return config;
  },
};

export default nextConfig;
