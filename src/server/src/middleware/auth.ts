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
