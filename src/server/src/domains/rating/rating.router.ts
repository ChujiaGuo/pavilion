import { Hono } from 'hono';

export const ratingRouter = new Hono();

ratingRouter.post('/submit', (c) => c.json({ message: 'not implemented' }, 201));

ratingRouter.get('/user/:userId', (c) =>
  c.json({ userId: c.req.param('userId'), history: [] })
);
