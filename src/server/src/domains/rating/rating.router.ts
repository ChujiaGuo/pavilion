import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getUserRatingDisplay, getRatingHistory, submitRating, type SubmitRatingResult } from './rating.service.js';
import type { RelativeVote } from '@pavilion/types';

export const ratingRouter = new Hono<{ Variables: { userId: string } }>();

const REASON_STATUS: Record<Extract<SubmitRatingResult, { ok: false }>['reason'], 400 | 403 | 404 | 409> = {
  invalid_vote: 400,
  self_rating: 400,
  not_participant: 403,
  session_not_eligible: 403,
  duplicate: 409,
  not_found: 404,
};

ratingRouter.post('/submit', auth, async (c) => {
  const body = await c.req.json();
  const { sessionId, rateeId, vote } = body as { sessionId?: string; rateeId?: string; vote?: RelativeVote };

  if (!sessionId || !rateeId || !vote) {
    return c.json({ error: 'sessionId, rateeId, and vote are required' }, 400);
  }

  const result = await submitRating(c.get('userId'), sessionId, rateeId, vote);
  if (!result.ok) {
    return c.json({ error: result.reason }, REASON_STATUS[result.reason]);
  }
  return c.json({ success: true }, 201);
});

ratingRouter.get('/user/:userId', auth, async (c) => {
  const userId = c.req.param('userId');
  const rating = await getUserRatingDisplay(userId, c.get('userId'));
  if (!rating) return c.json({ error: 'Not found' }, 404);
  return c.json({ userId, rating });
});

ratingRouter.get('/user/:userId/history', auth, async (c) => {
  const userId = c.req.param('userId');
  if (userId !== c.get('userId')) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const history = await getRatingHistory(userId);
  return c.json({ history });
});