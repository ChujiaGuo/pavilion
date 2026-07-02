import type { NextConfig } from 'next';

function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} ${apiUrl}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const nextConfig: NextConfig = {
  transpilePackages: ['@pavilion/types'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy-Report-Only', value: buildCsp() }],
      },
    ];
  },
};

export default nextConfig;
