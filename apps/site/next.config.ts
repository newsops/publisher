import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  trailingSlash: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Static artifacts must be reproducible for service-isolation verification.
  generateBuildId: async () => 'static',
  images: {
    unoptimized: true,
  },
}

if (process.env.NODE_ENV === 'production') nextConfig.output = 'export'
if (process.env.NODE_ENV === 'development') {
  nextConfig.rewrites = async () => [
    { source: '/:year/:month/:slug.html', destination: '/:year/:month/:slug' },
  ]
}

export default nextConfig
