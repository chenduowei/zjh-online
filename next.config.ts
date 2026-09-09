import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 便于 Docker / 云主机单目录部署
  output: 'standalone',
};

export default nextConfig;
