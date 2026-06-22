/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Use proto folder as the source directory
  // Next.js 16 uses app directory by default

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').trim(),
  },

  // Rewrites for API proxy during development
  async rewrites() {
    return [
      // Proxy /api requests to backend during local development
      // Comment out in production when using separate backend URL
      // {
      //   source: '/api/:path*',
      //   destination: 'http://localhost:8080/api/:path*',
      // },
    ];
  },

  // Redirects — keep old URLs alive after /strategy reorganization
  async redirects() {
    return [
      // Backward-compat: old /lean-canvas.html → new /strategy/lean-canvas.html
      { source: '/lean-canvas.html', destination: '/strategy/lean-canvas.html', permanent: true },
    ];
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com https://cdn.paddle.com",
              "style-src 'self' 'unsafe-inline' https://*.paddle.com",
              `connect-src 'self' ${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').trim()} https://trust-backend-knnd76vaqq-du.a.run.app https://sdqhirgvqplcdjmgbjxj.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://*.paddle.com`,
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "frame-src 'self' https://*.paddle.com",
              "frame-ancestors 'none'",
            ].join('; ')
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
