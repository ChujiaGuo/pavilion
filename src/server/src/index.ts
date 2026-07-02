import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { noStore } from './middleware/no-store.js';
import { venueRouter } from './domains/venue/venue.router.js';
import { sessionRouter } from './domains/session/session.router.js';
import { userRouter } from './domains/user/user.router.js';
import { ratingRouter } from './domains/rating/rating.router.js';
import { messagingRouter } from './domains/messaging/messaging.router.js';

const app = new Hono();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use('/api/*', noStore);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/venues', venueRouter);
app.route('/api/sessions', sessionRouter);
app.route('/api/users', userRouter);
app.route('/api/ratings', ratingRouter);
app.route('/api/messaging', messagingRouter);

const PORT = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
