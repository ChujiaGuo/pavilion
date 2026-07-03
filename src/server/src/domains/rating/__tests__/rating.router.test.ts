import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

// Mock the service so router tests only verify HTTP behavior,
// not the multi-step DB logic already covered in rating.service.test.ts.
vi.mock('../rating.service.js', () => ({
  getUserRatingDisplay: vi.fn(),
  getRatingHistory: vi.fn(),
  getRawScore: vi.fn(),
  submitRating: vi.fn(),
  submitOnboardingQuiz: vi.fn(),
  skipOnboarding: vi.fn(),
  adminAdjustRating: vi.fn(),
}));

import { supabase } from '../../../lib/supabase.js';
import {
  getUserRatingDisplay,
  getRatingHistory,
  getRawScore,
  submitRating,
  submitOnboardingQuiz,
  skipOnboarding,
  adminAdjustRating,
} from '../rating.service.js';
import { ratingRouter } from '../rating.router.js';

const mockGetUser = vi.mocked(supabase.auth.getUser);
const mockGetUserRatingDisplay = vi.mocked(getUserRatingDisplay);
const mockGetRatingHistory = vi.mocked(getRatingHistory);
const mockGetRawScore = vi.mocked(getRawScore);
const mockSubmitRating = vi.mocked(submitRating);
const mockSubmitOnboardingQuiz = vi.mocked(submitOnboardingQuiz);
const mockSkipOnboarding = vi.mocked(skipOnboarding);
const mockAdminAdjustRating = vi.mocked(adminAdjustRating);

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';
const RATEE_ID = 'ratee-1';

const RATING_DISPLAY = {
  grade: 4,
  subtier: 2 as const,
  label: 'Grade 4 — II',
  isProvisional: false,
  atUnverifiedCeiling: false,
};

function withAuth(asUserId = USER_ID): Record<string, string> {
  mockGetUser.mockResolvedValue({
    data: { user: { id: asUserId } },
    error: null,
  } as any);
  return { Authorization: 'Bearer mock-token' };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// POST /submit
// ---------------------------------------------------------------------------

describe('POST /submit', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request('/submit', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on self_rating', async () => {
    mockSubmitRating.mockResolvedValue({ ok: false, reason: 'self_rating' });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 on not_participant', async () => {
    mockSubmitRating.mockResolvedValue({ ok: false, reason: 'not_participant' });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 on session_not_eligible', async () => {
    mockSubmitRating.mockResolvedValue({ ok: false, reason: 'session_not_eligible' });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 on duplicate', async () => {
    mockSubmitRating.mockResolvedValue({ ok: false, reason: 'duplicate' });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 on not_found', async () => {
    mockSubmitRating.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 201 with { success: true } on success, and submits as the authenticated rater', async () => {
    mockSubmitRating.mockResolvedValue({ ok: true });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true });
    expect(mockSubmitRating).toHaveBeenCalledWith(USER_ID, SESSION_ID, RATEE_ID, 'stronger');
  });

  it('never includes score data in the response body', async () => {
    mockSubmitRating.mockResolvedValue({ ok: true });
    const res = await ratingRouter.request('/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, rateeId: RATEE_ID, vote: 'stronger' }),
    });
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['success']);
  });
});

// ---------------------------------------------------------------------------
// GET /user/:userId
// ---------------------------------------------------------------------------

describe('GET /user/:userId', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request(`/user/${USER_ID}`);
    expect(res.status).toBe(401);
    expect(mockGetUserRatingDisplay).not.toHaveBeenCalled();
  });

  it('returns 200 with only the derived rating display, no raw score', async () => {
    mockGetUserRatingDisplay.mockResolvedValue(RATING_DISPLAY);
    const res = await ratingRouter.request(`/user/${USER_ID}`, { headers: withAuth() });
    const body = await res.json();
    expect(body).toEqual({ userId: USER_ID, rating: RATING_DISPLAY });
  });

  it('passes the authenticated requester id through so the service can check privacy', async () => {
    mockGetUserRatingDisplay.mockResolvedValue(RATING_DISPLAY);
    await ratingRouter.request(`/user/${USER_ID}`, { headers: withAuth('someone-else') });
    expect(mockGetUserRatingDisplay).toHaveBeenCalledWith(USER_ID, 'someone-else');
  });

  it('returns 404 when the user has no rating record or the profile is private to a non-owner', async () => {
    mockGetUserRatingDisplay.mockResolvedValue(null);
    const res = await ratingRouter.request(`/user/${USER_ID}`, { headers: withAuth() });
    expect(res.status).toBe(404);
  });

  describe('?raw=true', () => {
    it('returns 403 when the caller is not admin+, without ever calling getUserRatingDisplay', async () => {
      mockGetRawScore.mockResolvedValue({ ok: false, reason: 'forbidden' });
      const res = await ratingRouter.request(`/user/${USER_ID}?raw=true`, { headers: withAuth() });
      expect(res.status).toBe(403);
      expect(mockGetUserRatingDisplay).not.toHaveBeenCalled();
    });

    it('returns 404 when the target user does not exist', async () => {
      mockGetRawScore.mockResolvedValue({ ok: false, reason: 'not_found' });
      const res = await ratingRouter.request(`/user/${USER_ID}?raw=true`, { headers: withAuth('admin-1') });
      expect(res.status).toBe(404);
    });

    it('returns the rating and raw score for an admin caller', async () => {
      mockGetRawScore.mockResolvedValue({ ok: true, rawScore: 6.42 });
      mockGetUserRatingDisplay.mockResolvedValue(RATING_DISPLAY);

      const res = await ratingRouter.request(`/user/${USER_ID}?raw=true`, { headers: withAuth('admin-1') });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: USER_ID, rating: RATING_DISPLAY, rawScore: 6.42 });
    });

    it('bypasses the private-profile check for a confirmed admin caller — the bug this covers', async () => {
      // Regression coverage: the admin user panel previously 404'd here for
      // private profiles because getUserRatingDisplay was called without
      // bypassPrivacy, before ever reaching the admin-gated raw-score check.
      mockGetRawScore.mockResolvedValue({ ok: true, rawScore: 6.42 });
      mockGetUserRatingDisplay.mockResolvedValue(RATING_DISPLAY);

      const res = await ratingRouter.request(`/user/${USER_ID}?raw=true`, { headers: withAuth('admin-1') });
      expect(res.status).toBe(200);
      expect(mockGetUserRatingDisplay).toHaveBeenCalledWith(USER_ID, 'admin-1', { bypassPrivacy: true });
    });

    it('still 404s if the profile disappears between the raw-score check and the display fetch', async () => {
      mockGetRawScore.mockResolvedValue({ ok: true, rawScore: 6.42 });
      mockGetUserRatingDisplay.mockResolvedValue(null);

      const res = await ratingRouter.request(`/user/${USER_ID}?raw=true`, { headers: withAuth('admin-1') });
      expect(res.status).toBe(404);
    });

    it('does not bypass privacy on the non-raw path', async () => {
      mockGetUserRatingDisplay.mockResolvedValue(RATING_DISPLAY);
      await ratingRouter.request(`/user/${USER_ID}`, { headers: withAuth('someone-else') });
      expect(mockGetUserRatingDisplay).toHaveBeenCalledWith(USER_ID, 'someone-else');
      expect(mockGetRawScore).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// GET /user/:userId/history
// ---------------------------------------------------------------------------

describe('GET /user/:userId/history', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request(`/user/${USER_ID}/history`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when requesting another user\'s history', async () => {
    const res = await ratingRouter.request(`/user/${USER_ID}/history`, {
      headers: withAuth('someone-else'),
    });
    expect(res.status).toBe(403);
    expect(mockGetRatingHistory).not.toHaveBeenCalled();
  });

  it('returns 200 with the history when requesting your own', async () => {
    mockGetRatingHistory.mockResolvedValue([
      { userId: USER_ID, sessionId: SESSION_ID, scoreBefore: 4.0, scoreAfter: 4.06, delta: 0.06, createdAt: 'now' },
    ]);
    const res = await ratingRouter.request(`/user/${USER_ID}/history`, {
      headers: withAuth(USER_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
  });

  it('never exposes rater identity or individual votes in the history payload', async () => {
    mockGetRatingHistory.mockResolvedValue([
      { userId: USER_ID, sessionId: SESSION_ID, scoreBefore: 4.0, scoreAfter: 4.06, delta: 0.06, createdAt: 'now' },
    ]);
    const res = await ratingRouter.request(`/user/${USER_ID}/history`, {
      headers: withAuth(USER_ID),
    });
    const body = await res.json();
    for (const entry of body.history) {
      expect(entry).not.toHaveProperty('raterId');
      expect(entry).not.toHaveProperty('vote');
    }
  });
});

// ---------------------------------------------------------------------------
// POST /onboarding/submit
// ---------------------------------------------------------------------------

describe('POST /onboarding/submit', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request('/onboarding/submit', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when answers is missing', async () => {
    const res = await ratingRouter.request('/onboarding/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockSubmitOnboardingQuiz).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid_answers', async () => {
    mockSubmitOnboardingQuiz.mockResolvedValue({ ok: false, reason: 'invalid_answers' });
    const res = await ratingRouter.request('/onboarding/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { highest_level_played: 'bogus' } }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 on already_completed', async () => {
    mockSubmitOnboardingQuiz.mockResolvedValue({ ok: false, reason: 'already_completed' });
    const res = await ratingRouter.request('/onboarding/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: {} }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 201 with the rating display on success, submitting as the authenticated user', async () => {
    mockSubmitOnboardingQuiz.mockResolvedValue({ ok: true, rating: RATING_DISPLAY });
    const answers = {
      highest_level_played: 'club_league',
      strongest_opponents: 'competitive_club',
      competitive_history: 'regional_sanctioned',
      play_frequency: 'weekly',
    };
    const res = await ratingRouter.request('/onboarding/submit', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ rating: RATING_DISPLAY });
    expect(mockSubmitOnboardingQuiz).toHaveBeenCalledWith(USER_ID, answers);
  });
});

// ---------------------------------------------------------------------------
// POST /onboarding/skip
// ---------------------------------------------------------------------------

describe('POST /onboarding/skip', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request('/onboarding/skip', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 409 on already_completed', async () => {
    mockSkipOnboarding.mockResolvedValue({ ok: false, reason: 'already_completed' });
    const res = await ratingRouter.request('/onboarding/skip', { method: 'POST', headers: withAuth() });
    expect(res.status).toBe(409);
  });

  it('returns 201 with the rating display on success, for the authenticated user', async () => {
    mockSkipOnboarding.mockResolvedValue({ ok: true, rating: RATING_DISPLAY });
    const res = await ratingRouter.request('/onboarding/skip', { method: 'POST', headers: withAuth() });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ rating: RATING_DISPLAY });
    expect(mockSkipOnboarding).toHaveBeenCalledWith(USER_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /user/:userId/adjust
// ---------------------------------------------------------------------------

describe('POST /user/:userId/adjust', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await ratingRouter.request(`/user/${RATEE_ID}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScore: 5.0 }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when newScore is not a number', async () => {
    const res = await ratingRouter.request(`/user/${RATEE_ID}/adjust`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScore: 'high' }),
    });
    expect(res.status).toBe(400);
    expect(mockAdminAdjustRating).not.toHaveBeenCalled();
  });

  it('returns 403 when the service reports forbidden', async () => {
    mockAdminAdjustRating.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const res = await ratingRouter.request(`/user/${RATEE_ID}/adjust`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScore: 5.0 }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 on concurrent_modification', async () => {
    mockAdminAdjustRating.mockResolvedValue({ ok: false, reason: 'concurrent_modification' });
    const res = await ratingRouter.request(`/user/${RATEE_ID}/adjust`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScore: 5.0 }),
    });
    expect(res.status).toBe(409);
  });

  it('returns the updated rating on success', async () => {
    mockAdminAdjustRating.mockResolvedValue({ ok: true, rating: RATING_DISPLAY });
    const res = await ratingRouter.request(`/user/${RATEE_ID}/adjust`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScore: 5.0 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rating: RATING_DISPLAY });
    expect(mockAdminAdjustRating).toHaveBeenCalledWith(USER_ID, RATEE_ID, 5.0);
  });
});