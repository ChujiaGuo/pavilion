import { Hono } from 'hono';

export const userRouter = new Hono();

userRouter.get('/:id', (c) => c.json({ id: c.req.param('id') }));

userRouter.patch('/:id', (c) => c.json({ message: 'not implemented' }));
