import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getAdminRole } from '../../lib/admin.js';
import { listAdmins, setAdminRole, removeAdminRole, listAdminHistory } from './admin.service.js';
import type { AdminRole } from '@pavilion/types';

export const adminRouter = new Hono<{ Variables: { userId: string } }>();

adminRouter.use(auth);

const VALID_ROLES: AdminRole[] = ['venue_verifier', 'moderator', 'admin', 'owner'];

adminRouter.get('/me', async (c) => {
  const role = await getAdminRole(c.get('userId'));
  return c.json({ role });
});

adminRouter.get('/roles', async (c) => {
  const result = await listAdmins(c.get('userId'));
  if (!result.ok) return c.json({ error: 'Forbidden' }, 403);
  return c.json({ admins: result.admins });
});

adminRouter.patch('/roles/:userId', async (c) => {
  const body = await c.req.json();
  const { role } = body as { role?: unknown };

  if (typeof role !== 'string' || !VALID_ROLES.includes(role as AdminRole)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const result = await setAdminRole(c.get('userId'), c.req.param('userId'), role as AdminRole);
  if (!result.ok) {
    return c.json({ error: result.reason }, result.reason === 'forbidden' ? 403 : 404);
  }
  return c.json(result.grant);
});

adminRouter.delete('/roles/:userId', async (c) => {
  const result = await removeAdminRole(c.get('userId'), c.req.param('userId'));
  if (!result.ok) {
    return c.json({ error: result.reason }, result.reason === 'forbidden' ? 403 : 404);
  }
  return c.json({ success: true });
});

adminRouter.get('/history', async (c) => {
  const result = await listAdminHistory(c.get('userId'));
  if (!result.ok) return c.json({ error: 'Forbidden' }, 403);
  return c.json({ entries: result.entries });
});
