import { Hono } from 'hono';

export const venueRouter = new Hono();

venueRouter.get('/', (c) => c.json({ venues: [] }));

venueRouter.get('/:id', (c) => c.json({ id: c.req.param('id') }));
