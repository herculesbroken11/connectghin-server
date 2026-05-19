const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['admin.connectghin.com'],
  // Monorepo: hoisted `next` is often under repo root `node_modules`.
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  async redirects() {
    return [
      { source: '/ghin', destination: '/verification', permanent: false },
      { source: '/ghin/:id', destination: '/verification/:id', permanent: false },
      { source: '/app-settings', destination: '/settings', permanent: false },
    ];
  },
};

module.exports = nextConfig;
