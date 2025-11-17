import type { NextConfig } from "next";
import path from "node:path";

const LOADER = path.resolve(__dirname, 'src/visual-edits/component-tagger-loader.js');

const nextConfig: NextConfig = {
  // Static export for Netlify
  output: 'export',
  
  images: {
    unoptimized: true, // Required for static export
  },
  
  eslint: {
    ignoreDuringBuilds: true, // Disable ESLint during build for now
  },
  
  // Webpack configuration to ensure path resolution works in all environments
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
