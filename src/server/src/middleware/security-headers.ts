import { createMiddleware } from 'hono/factory';

// X-Frame-Options and Permissions-Policy are omitted here — both concern
// browser rendering contexts (framing, camera/mic/etc.), which don't apply
// to an API that only ever returns JSON (same reasoning CSP is skipped on
// this server — see technical-notes.md "Security Headers & CORS").
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  // Browsers only honor HSTS over HTTPS (RFC 6797), so this is a no-op
  // rather than a lockout risk during local HTTP dev.
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});
