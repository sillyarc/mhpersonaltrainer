/** @type {import('next').NextConfig} */
const isTauriBuild = process.env.TAURI_BUILD === '1';
const isHostingBuild = process.env.HOSTING_BUILD === '1';
const isProduction = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: '.next',
  images: {
    unoptimized: true,
  },
  outputFileTracing: false,
};

if ((isTauriBuild && isProduction) || isHostingBuild) {
  if (isTauriBuild && isProduction) {
    nextConfig.distDir = '.next-tauri';
  }
  nextConfig.output = 'export';
}

module.exports = nextConfig;
