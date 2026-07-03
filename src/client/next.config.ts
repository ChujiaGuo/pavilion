import type { NextConfig } from 'next';

// CSP is set in middleware.ts, not here — it needs a per-request nonce for
// Next's own inline hydration/RSC scripts, which a static header from
// next.config.ts can't provide.
const nextConfig: NextConfig = {
  transpilePackages: ['@pavilion/types'],
};

export default nextConfig;
