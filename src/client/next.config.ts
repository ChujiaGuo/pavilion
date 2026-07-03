import type { NextConfig } from 'next';

// CSP is set in middleware.ts, not here — it needs a per-request nonce for
// Next's own inline hydration/RSC scripts, which a static header from
// next.config.ts can't provide. Everything below is static, so it belongs
// here instead — this also covers the static-asset paths middleware.ts's
// matcher excludes (_next/static, images, favicon), which a middleware-set
// header wouldn't reach.
const nextConfig: NextConfig = {
  transpilePackages: ['@pavilion/types'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Browsers only honor HSTS over HTTPS (RFC 6797), so this is a
          // no-op rather than a lockout risk during local HTTP dev.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Belt-and-suspenders alongside the CSP's frame-ancestors 'none'.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Deny-by-default; geolocation is left available since a future
          // location-based feature may need it.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
