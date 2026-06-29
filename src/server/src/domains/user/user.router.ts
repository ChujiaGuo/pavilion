import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getUserById, updateUser, softDeleteUser } from './user.service.js';

export const userRouter = new Hono<{ Variables: { userId: string } }>();

userRouter.use(auth);

userRouter.get('/:id', async (c) => {
  const user = await getUserById(c.req.param('id'), c.get('userId'));
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(user);
});

userRouter.patch('/:id', async (c) => {
  if (c.req.param('id') !== c.get('userId')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const user = await updateUser(c.get('userId'), body);
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(user);
});

userRouter.delete('/:id', async (c) => {
  if (c.req.param('id') !== c.get('userId')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const ok = await softDeleteUser(c.get('userId'));
  if (!ok) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});
