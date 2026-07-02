import { createMiddleware } from 'hono/factory';

// API responses can carry per-user/private data (profiles, ratings, RSVPs) —
// never let an intermediary cache (browser, proxy, CDN) serve a response
// fetched under one caller's Authorization header to a different caller.
export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
});
