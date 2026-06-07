/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // avoid double WebSocket connects in dev
};

module.exports = nextConfig;
