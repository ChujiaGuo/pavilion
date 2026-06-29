import { Hono } from 'hono';

export const sessionRouter = new Hono();

sessionRouter.get('/', (c) => c.json({ sessions: [] }));

sessionRouter.post('/', (c) => c.json({ message: 'not implemented' }, 201));

sessionRouter.get('/:id', (c) => c.json({ id: c.req.param('id') }));
