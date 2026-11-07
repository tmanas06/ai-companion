const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ai-companion/shared'],
  experimental: {
    optimizePackageImports: ['@ai-companion/shared'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana-program/memo': false,
      '@solana-program/system': false,
      '@solana-program/token': false,
      '@solana-program/token-2022': false,
      '@solana/kit': false,
      '@solana/program-client-core': false,
      '@farcaster/mini-app-solana': false,
      '@farcaster/frame-sdk': false,
      '@abstract-foundation/agw-client': false,
      permissionless: false,
    };
    return config;
  },
};

module.exports = nextConfig;
