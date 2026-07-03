import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import {
  getUserRatingDisplay,
  getRatingHistory,
  getRawScore,
  submitRating,
  submitOnboardingQuiz,
  skipOnboarding,
  adminAdjustRating,
  type SubmitRatingResult,
  type OnboardingResult,
  type AdminAdjustRatingResult,
} from './rating.service.js';
import type { OnboardingAnswers } from './rating.algorithm.js';
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

  // ?raw=true — admin+ only, used by the admin user-edit panel, which
  // already lets an admin set the raw score directly and shouldn't have to
  // work backward from the derived grade to know the current one. getRawScore
  // gates on admin role first; only once that's confirmed do we bypass the
  // private-profile check for the display too, so an admin can see a private
  // user's rating from that panel — everywhere else, privacy still applies.
  if (c.req.query('raw') === 'true') {
    const result = await getRawScore(c.get('userId'), userId);
    if (!result.ok) return c.json({ error: result.reason }, result.reason === 'forbidden' ? 403 : 404);
    const rating = await getUserRatingDisplay(userId, c.get('userId'), { bypassPrivacy: true });
    if (!rating) return c.json({ error: 'Not found' }, 404);
    return c.json({ userId, rating, rawScore: result.rawScore });
  }

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

const ONBOARDING_REASON_STATUS: Record<Extract<OnboardingResult, { ok: false }>['reason'], 400 | 409> = {
  invalid_answers: 400,
  already_completed: 409,
};

ratingRouter.post('/onboarding/submit', auth, async (c) => {
  const body = await c.req.json();
  const { answers } = body as { answers?: OnboardingAnswers };

  if (!answers) {
    return c.json({ error: 'answers is required' }, 400);
  }

  const result = await submitOnboardingQuiz(c.get('userId'), answers);
  if (!result.ok) {
    return c.json({ error: result.reason }, ONBOARDING_REASON_STATUS[result.reason]);
  }
  return c.json({ rating: result.rating }, 201);
});

ratingRouter.post('/onboarding/skip', auth, async (c) => {
  const result = await skipOnboarding(c.get('userId'));
  if (!result.ok) {
    return c.json({ error: result.reason }, ONBOARDING_REASON_STATUS[result.reason]);
  }
  return c.json({ rating: result.rating }, 201);
});

const ADJUST_REASON_STATUS: Record<Extract<AdminAdjustRatingResult, { ok: false }>['reason'], 403 | 404 | 409> = {
  forbidden: 403,
  not_found: 404,
  concurrent_modification: 409,
};

ratingRouter.post('/user/:userId/adjust', auth, async (c) => {
  const body = await c.req.json();
  const { newScore } = body as { newScore?: unknown };

  if (typeof newScore !== 'number' || !Number.isFinite(newScore)) {
    return c.json({ error: 'newScore must be a number' }, 400);
  }

  const result = await adminAdjustRating(c.get('userId'), c.req.param('userId'), newScore);
  if (!result.ok) {
    return c.json({ error: result.reason }, ADJUST_REASON_STATUS[result.reason]);
  }
  return c.json({ rating: result.rating, rawScore: result.rawScore });
});