import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { supabase } from '../lib/supabase.js';

export const auth = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

  c.set('userId', user.id);
  await next();
});

// For routes that behave differently for logged-in vs. anonymous callers but
// don't require auth outright (e.g. gating invite_only visibility, or
// resolving a caller identity for privacy checks). Resolves to undefined
// rather than rejecting when no token is present or the token is invalid.
export async function getOptionalUserId(c: Context): Promise<string | undefined> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return undefined;

  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id;
}
