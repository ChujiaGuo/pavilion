import { Hono } from 'hono';

// Session-scoped group chat via Stream Chat SDK
// This router handles token generation and channel provisioning only

export const messagingRouter = new Hono();

messagingRouter.post('/token', (c) => c.json({ message: 'not implemented' }));

messagingRouter.post('/session/:sessionId/channel', (c) =>
  c.json({ sessionId: c.req.param('sessionId'), message: 'not implemented' })
);
