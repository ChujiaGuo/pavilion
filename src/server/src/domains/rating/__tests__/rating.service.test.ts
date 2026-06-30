import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from '../../../lib/supabase.js';
import { computeRatingUpdate, toRatingDisplay, submitRating, fullDaysElapsed } from '../rating.service.js';

// ---------------------------------------------------------------------------
// computeRatingUpdate — pure function, no mocking needed
// ---------------------------------------------------------------------------

const baseInput = {
  raterScore: 4.0,
  rateeScore: 4.0,
  rateeFloor: null,
  rateeVerifiedTier: null,
  isPlacement: false,
  sessionAnchor: 4.0,
  raterPriorPairCount: 0,
  raterDaysSinceLastRated: null,
  demotionProtectionElapsedDays: null,
  promotionProtectionElapsedDays: null,
};

describe('computeRatingUpdate', () => {
  it('returns null for did_not_play', () => {
    expect(computeRatingUpdate({ ...baseInput, vote: 'did_not_play' })).toBeNull();
  });

  it('moves the score toward the implied target on a positive vote', () => {
    const result = computeRatingUpdate({ ...baseInput, vote: 'stronger' });
    expect(result?.delta).toBeCloseTo(0.06, 2);
    expect(result?.newScore).toBeCloseTo(4.06, 2);
  });

  it('moves the score down on a negative vote', () => {
    // Offset off a whole number so this doesn't collide with tier-boundary
    // protection (covered separately below) — 4.0 sits exactly on a grade line.
    const result = computeRatingUpdate({
      ...baseInput,
      vote: 'weaker',
      raterScore: 4.5,
      rateeScore: 4.5,
      sessionAnchor: 4.5,
    });
    expect(result?.delta).toBeLessThan(0);
    expect(result?.newScore).toBeLessThan(4.5);
  });

  it('clamps the swing to ±0.5 outside placement', () => {
    const result = computeRatingUpdate({
      ...baseInput,
      vote: 'much_stronger',
      sessionAnchor: 9.0, // far implied target to force clipping
    });
    expect(result?.delta).toBeCloseTo(0.5, 2);
  });

  it('clamps the swing to ±1.0 during placement', () => {
    const result = computeRatingUpdate({
      ...baseInput,
      vote: 'much_stronger',
      sessionAnchor: 9.0,
      isPlacement: true,
    });
    expect(result?.delta).toBeCloseTo(1.0, 2);
  });

  it('produces a larger raw swing during placement than after it', () => {
    const normal = computeRatingUpdate({ ...baseInput, vote: 'stronger' });
    const placement = computeRatingUpdate({ ...baseInput, vote: 'stronger', isPlacement: true });
    expect(placement!.delta).toBeGreaterThan(normal!.delta);
  });

  describe('pro weighting (grade 8+ raters)', () => {
    // Distance from ratee held at exactly the calibration threshold (2.0) for both
    // pro and non-pro raters so the calibration-weight term is identical (=1) in
    // every case below, isolating the pro multiplier's effect. Offset off a whole
    // number (6.3, not 6.0) so this doesn't collide with tier-boundary protection.
    const proCalibratedInput = { ...baseInput, raterScore: 8.3, rateeScore: 6.3, sessionAnchor: 6.3 };
    const nonProCalibratedInput = { ...baseInput, raterScore: 4.3, rateeScore: 6.3, sessionAnchor: 6.3 };

    it('does not boost upward votes from a pro rater', () => {
      const pro = computeRatingUpdate({ ...proCalibratedInput, vote: 'stronger' });
      const nonPro = computeRatingUpdate({ ...nonProCalibratedInput, vote: 'stronger' });
      expect(pro!.delta).toBeCloseTo(nonPro!.delta, 2);
    });

    it('boosts downward votes from a pro rater', () => {
      const pro = computeRatingUpdate({ ...proCalibratedInput, vote: 'weaker' });
      const nonPro = computeRatingUpdate({ ...nonProCalibratedInput, vote: 'weaker' });
      expect(Math.abs(pro!.delta)).toBeGreaterThan(Math.abs(nonPro!.delta));
    });
  });

  describe('calibration distance weighting', () => {
    it('reduces weight when the rater is far outside their own calibration range', () => {
      const close = computeRatingUpdate({ ...baseInput, vote: 'stronger', raterScore: 4.0 });
      const far = computeRatingUpdate({ ...baseInput, vote: 'stronger', raterScore: 8.5 });
      expect(far!.delta).toBeLessThan(close!.delta);
    });

    it('floors the calibration weight rather than letting it go negative', () => {
      const veryFar = computeRatingUpdate({ ...baseInput, vote: 'stronger', raterScore: 14.0 });
      const extremelyFar = computeRatingUpdate({ ...baseInput, vote: 'stronger', raterScore: 24.0 });
      expect(veryFar!.delta).toBeCloseTo(extremelyFar!.delta, 2);
    });
  });

  describe('recency-adjusted familiarity weighting', () => {
    it('gives a fresh rater (no prior pairing) full weight', () => {
      const result = computeRatingUpdate({ ...baseInput, vote: 'stronger' });
      expect(result?.delta).toBeCloseTo(0.06, 2);
    });

    it('discounts a rater with a sustained, recent pairing history', () => {
      const result = computeRatingUpdate({
        ...baseInput,
        vote: 'stronger',
        raterPriorPairCount: 8,
        raterDaysSinceLastRated: 1,
      });
      expect(result!.delta).toBeLessThan(0.06);
    });

    it('resets familiarity weight toward fresh after a long gap, even with a high pair count', () => {
      const stale = computeRatingUpdate({
        ...baseInput,
        vote: 'stronger',
        raterPriorPairCount: 8,
        raterDaysSinceLastRated: 600, // 10 half-lives
      });
      const recent = computeRatingUpdate({
        ...baseInput,
        vote: 'stronger',
        raterPriorPairCount: 8,
        raterDaysSinceLastRated: 1,
      });
      expect(stale!.delta).toBeGreaterThan(recent!.delta);
      expect(stale!.delta).toBeCloseTo(0.06, 2); // ≈ fresh-rater delta
    });
  });

  describe('locks and bounds', () => {
    it('never lets the score drop below the rating floor', () => {
      const result = computeRatingUpdate({
        ...baseInput,
        vote: 'much_weaker',
        raterScore: 5.8,
        rateeScore: 5.8,
        rateeFloor: 6.0,
        sessionAnchor: 2.0,
      });
      expect(result?.newScore).toBe(6.0);
      expect(result?.delta).toBeCloseTo(0.2, 2);
    });

    it('hard-caps an unverified player below 8.0', () => {
      const result = computeRatingUpdate({
        ...baseInput,
        vote: 'much_stronger',
        raterScore: 7.95,
        rateeScore: 7.95,
        sessionAnchor: 10.0,
        rateeVerifiedTier: null,
      });
      expect(result?.newScore).toBeLessThanOrEqual(7.99);
    });

    it('allows a verified player to cross 8.0', () => {
      // promotionProtectionElapsedDays past the window so the crossing actually
      // releases this vote, rather than pinning at 7.99 like the first attempt
      // would (see "tier-boundary protection" below) — both are correct, this
      // test is specifically about the ceiling, not the protection window.
      const result = computeRatingUpdate({
        ...baseInput,
        vote: 'much_stronger',
        raterScore: 7.95,
        rateeScore: 7.95,
        sessionAnchor: 10.0,
        rateeVerifiedTier: 8,
        promotionProtectionElapsedDays: 3,
      });
      expect(result?.newScore).toBeGreaterThan(7.99);
    });

    it('never lets the score drop below 1.0', () => {
      const result = computeRatingUpdate({
        ...baseInput,
        vote: 'much_weaker',
        raterScore: 1.05,
        rateeScore: 1.05,
        sessionAnchor: 1.0,
      });
      expect(result?.newScore).toBe(1.0);
    });
  });

  describe('tier-boundary protection', () => {
    describe('demotion', () => {
      const weakVoteAtFloor = {
        ...baseInput,
        vote: 'weaker' as const,
        raterScore: 6.0,
        rateeScore: 6.0,
        sessionAnchor: 5.0,
      };

      it('pins the score at the grade floor on first crossing, starting the clock', () => {
        const result = computeRatingUpdate({ ...weakVoteAtFloor, demotionProtectionElapsedDays: null });
        expect(result).toMatchObject({ newScore: 6.0, delta: 0, demotionProtectionAction: 'start' });
      });

      it('keeps pinning at the floor while the window has not elapsed', () => {
        const result = computeRatingUpdate({ ...weakVoteAtFloor, demotionProtectionElapsedDays: 3 });
        expect(result).toMatchObject({ newScore: 6.0, delta: 0, demotionProtectionAction: 'continue' });
      });

      it('releases to exactly subtier IV of the grade below once the window elapses', () => {
        const result = computeRatingUpdate({ ...weakVoteAtFloor, demotionProtectionElapsedDays: 7 });
        expect(result).toMatchObject({ newScore: 5.99, delta: -0.01, demotionProtectionAction: 'release' });
      });

      it('cancels immediately if a vote pulls the score back above the floor mid-window', () => {
        const result = computeRatingUpdate({
          ...baseInput,
          vote: 'stronger',
          raterScore: 6.0,
          rateeScore: 6.0,
          sessionAnchor: 6.5,
          demotionProtectionElapsedDays: 4,
        });
        expect(result).toMatchObject({ newScore: 6.12, demotionProtectionAction: 'cancel' });
      });

      it('pins throughout the window and never skips a grade, no matter how many weak votes land in between', () => {
        const day0 = computeRatingUpdate({ ...weakVoteAtFloor, sessionAnchor: 0.0, demotionProtectionElapsedDays: null });
        expect(day0).toMatchObject({ newScore: 6.0, demotionProtectionAction: 'start' });

        const day3 = computeRatingUpdate({ ...weakVoteAtFloor, sessionAnchor: 0.0, demotionProtectionElapsedDays: 3 });
        expect(day3).toMatchObject({ newScore: 6.0, demotionProtectionAction: 'continue' });

        const day7 = computeRatingUpdate({ ...weakVoteAtFloor, sessionAnchor: 0.0, demotionProtectionElapsedDays: 7 });
        expect(day7).toMatchObject({ newScore: 5.99, demotionProtectionAction: 'release' });
      });

      it('never triggers at the absolute grade-1 floor — MIN_SCORE already covers it', () => {
        const result = computeRatingUpdate({
          ...baseInput,
          vote: 'much_weaker',
          raterScore: 1.05,
          rateeScore: 1.05,
          sessionAnchor: 1.0,
          demotionProtectionElapsedDays: null,
        });
        expect(result).toMatchObject({ newScore: 1.0, demotionProtectionAction: 'none' });
      });

      it('is skipped entirely during placement', () => {
        const result = computeRatingUpdate({
          ...baseInput,
          vote: 'much_weaker',
          raterScore: 6.0,
          rateeScore: 6.0,
          sessionAnchor: 2.0,
          isPlacement: true,
          demotionProtectionElapsedDays: null,
        });
        expect(result?.demotionProtectionAction).toBe('none');
        expect(result?.newScore).toBeLessThan(6.0); // moved freely past the boundary
      });
    });

    describe('promotion', () => {
      const strongVoteAtCeiling = {
        ...baseInput,
        vote: 'stronger' as const,
        raterScore: 7.0,
        rateeScore: 6.99,
        sessionAnchor: 7.5,
      };

      it('pins the score at the grade ceiling on first crossing, starting the clock', () => {
        const result = computeRatingUpdate({ ...strongVoteAtCeiling, promotionProtectionElapsedDays: null });
        expect(result).toMatchObject({ newScore: 6.99, delta: 0, promotionProtectionAction: 'start' });
      });

      it('keeps pinning at the ceiling while the (shorter) window has not elapsed', () => {
        const result = computeRatingUpdate({ ...strongVoteAtCeiling, promotionProtectionElapsedDays: 1 });
        expect(result).toMatchObject({ newScore: 6.99, delta: 0, promotionProtectionAction: 'continue' });
      });

      it('releases to exactly subtier I of the grade above once the window elapses', () => {
        const result = computeRatingUpdate({ ...strongVoteAtCeiling, promotionProtectionElapsedDays: 3 });
        expect(result).toMatchObject({ newScore: 7.0, delta: 0.01, promotionProtectionAction: 'release' });
      });

      it('cancels immediately if a vote pulls the score back below the ceiling mid-window', () => {
        const result = computeRatingUpdate({
          ...baseInput,
          vote: 'weaker',
          raterScore: 7.0,
          rateeScore: 6.99,
          sessionAnchor: 6.0,
          promotionProtectionElapsedDays: 2,
        });
        expect(result).toMatchObject({ newScore: 6.81, promotionProtectionAction: 'cancel' });
      });

      it('uses a shorter window than demotion (3 days vs 7)', () => {
        const justUnderPromotion = computeRatingUpdate({ ...strongVoteAtCeiling, promotionProtectionElapsedDays: 2 });
        const justOverPromotion = computeRatingUpdate({ ...strongVoteAtCeiling, promotionProtectionElapsedDays: 3 });
        expect(justUnderPromotion?.promotionProtectionAction).toBe('continue');
        expect(justOverPromotion?.promotionProtectionAction).toBe('release');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// toRatingDisplay
// ---------------------------------------------------------------------------

describe('toRatingDisplay', () => {
  it('derives grade and subtier 1 from a whole-number score', () => {
    const display = toRatingDisplay(4.0, 0);
    expect(display).toMatchObject({ grade: 4, subtier: 1, label: 'Grade 4 — I' });
  });

  it('derives subtier 2 at the .25 boundary', () => {
    expect(toRatingDisplay(4.25, 0).subtier).toBe(2);
  });

  it('clamps subtier to 4 instead of rolling over at the top of a grade', () => {
    const display = toRatingDisplay(4.99, 0);
    expect(display.grade).toBe(4);
    expect(display.subtier).toBe(4);
  });

  it('uses equal-width floor-based quarters instead of rounding to the nearest boundary', () => {
    // With round-to-nearest, 4.24 would round up to subtier 2 (0.24/0.25 = 0.96 -> round = 1).
    // Floor-based bucketing keeps it in subtier 1 since 0.24 hasn't crossed the 0.25 quarter line.
    expect(toRatingDisplay(4.24, 0).subtier).toBe(1);
    expect(toRatingDisplay(4.25, 0).subtier).toBe(2);
  });

  it('does not collapse distinct scores within the top subtier band', () => {
    // Previously, round-to-nearest gave the top subtier a double-width band ([0.625, 1.0))
    // while the bottom subtier got a half-width band ([0, 0.125)). Floor-based bucketing
    // gives every subtier an equal 0.25-wide band, so these two remain distinguishable.
    expect(toRatingDisplay(7.7, 0).subtier).toBe(3);
    expect(toRatingDisplay(7.99, 0).subtier).toBe(4);
  });

  it('marks the rating provisional while placement sessions remain', () => {
    expect(toRatingDisplay(4.0, 2).isProvisional).toBe(true);
    expect(toRatingDisplay(4.0, 0).isProvisional).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fullDaysElapsed
// ---------------------------------------------------------------------------

describe('fullDaysElapsed', () => {
  it('counts full calendar days, ignoring time-of-day', () => {
    // 3:00pm June 1 -> 2:30pm June 8 is 7 elapsed calendar days, even though
    // it's a few hours short of a full 168-hour week.
    const since = new Date('2026-06-01T15:00:00Z');
    const now = new Date('2026-06-08T14:30:00Z');
    expect(fullDaysElapsed(since, now)).toBe(7);
  });

  it('returns 0 for the same calendar day regardless of time-of-day', () => {
    const since = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T23:00:00Z');
    expect(fullDaysElapsed(since, now)).toBe(0);
  });

  it('counts a full day even just after midnight', () => {
    const since = new Date('2026-06-01T23:59:00Z');
    const now = new Date('2026-06-02T00:01:00Z');
    expect(fullDaysElapsed(since, now)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// submitRating — Supabase orchestration
// ---------------------------------------------------------------------------

function makeChain() {
  const chain: Record<string, any> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['in'] = vi.fn(() => chain);
  chain['order'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['insert'] = vi.fn(() => chain);
  chain['update'] = vi.fn(() => chain);
  chain['upsert'] = vi.fn(() => chain);
  chain['single'] = vi.fn();
  chain['maybeSingle'] = vi.fn();
  chain['resolveAs'] = (value: any) => {
    const p = Promise.resolve(value);
    chain['then'] = p.then.bind(p);
    chain['catch'] = p.catch.bind(p);
    chain['finally'] = p.finally.bind(p);
  };
  return chain;
}

function arrayChain(data: any) {
  const chain = makeChain();
  chain.resolveAs({ data, error: null });
  return chain;
}

function singleChain(data: any) {
  const chain = makeChain();
  chain['single'].mockResolvedValue({ data, error: data ? null : new Error('not found') });
  return chain;
}

function maybeSingleChain(data: any) {
  const chain = makeChain();
  chain['maybeSingle'].mockResolvedValue({ data, error: null });
  return chain;
}

function okChain() {
  const chain = makeChain();
  chain.resolveAs({ error: null });
  return chain;
}

const mockFrom = vi.mocked(supabase.from);

const SESSION_ID = 'session-1';
const RATER_ID = 'rater-1';
const RATEE_ID = 'ratee-1';

const GOING_RSVPS = [
  { user_id: RATER_ID, status: 'going' },
  { user_id: RATEE_ID, status: 'going' },
];

const RATER_PROFILE = { internal_score: 4.0 };
const RATEE_PROFILE = {
  internal_score: 4.0,
  rating_floor: null,
  verified_tier: null,
  placement_sessions_remaining: 0,
  demotion_protection_started_at: null,
  promotion_protection_started_at: null,
};

// An eligible session: already happened, not cancelled.
const SESSION_ROW = { starts_at: '2020-01-01T00:00:00Z', status: 'completed' };
const eligibleSessionChain = () => singleChain(SESSION_ROW);

beforeEach(() => vi.clearAllMocks());

describe('submitRating', () => {
  it('rejects an invalid vote without touching the database', async () => {
    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'sideways' as any);
    expect(result).toEqual({ ok: false, reason: 'invalid_vote' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a self-rating without touching the database', async () => {
    const result = await submitRating(RATER_ID, SESSION_ID, RATER_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'self_rating' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns not_found when the session does not exist', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null));

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('rejects rating a cancelled session', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2020-01-01T00:00:00Z', status: 'cancelled' }));

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'session_not_eligible' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('rejects rating a session that has not started yet', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: future, status: 'upcoming' }));

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'session_not_eligible' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate submission from the same rater', async () => {
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([{ rater_id: RATER_ID }]));

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('rejects when the rater or ratee did not RSVP as going', async () => {
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([])) // no prior submissions
      .mockReturnValueOnce(arrayChain([{ user_id: RATEE_ID, status: 'going' }])); // rater missing

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'not_participant' });
  });

  it('returns not_found when a profile is missing', async () => {
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([]))
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(null)) // rater profile fetch fails
      .mockReturnValueOnce(singleChain(RATEE_PROFILE)); // ratee fetch still runs (separate await)

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('records a did_not_play vote without computing a score update', async () => {
    const submissionChain = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([]))
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(RATER_PROFILE))
      .mockReturnValueOnce(singleChain(RATEE_PROFILE))
      .mockReturnValueOnce(submissionChain)
      .mockReturnValueOnce(okChain()); // placement decrement (first submission for ratee in session)

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'did_not_play');
    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(7);
    expect(submissionChain['insert']).toHaveBeenCalledWith(
      expect.objectContaining({ vote: 'did_not_play' }),
    );
  });

  it('decrements placement_sessions_remaining on a did_not_play vote when it is the first submission for the ratee in this session', async () => {
    const placementUpdate = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([])) // first submission for this ratee in session
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(RATER_PROFILE))
      .mockReturnValueOnce(singleChain({ ...RATEE_PROFILE, placement_sessions_remaining: 3 }))
      .mockReturnValueOnce(okChain()) // submission insert
      .mockReturnValueOnce(placementUpdate); // placement decrement

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'did_not_play');

    expect(placementUpdate['update']).toHaveBeenCalledWith(
      expect.objectContaining({ placement_sessions_remaining: 2 }),
    );
  });

  it('does not decrement placement_sessions_remaining on a did_not_play vote when another rater already submitted', async () => {
    const submissionChain = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([{ rater_id: 'someone-else' }])) // not first submission
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(RATER_PROFILE))
      .mockReturnValueOnce(singleChain({ ...RATEE_PROFILE, placement_sessions_remaining: 3 }))
      .mockReturnValueOnce(submissionChain); // submission insert — no further calls expected

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'did_not_play');

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(6);
  });

  it('updates the ratee score and writes rating history on a normal vote', async () => {
    const submissionInsert = okChain();
    const familiarityUpsert = okChain();
    const profileUpdate = okChain();
    const historyInsert = okChain();

    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([])) // no prior submissions -> first for ratee in session
      .mockReturnValueOnce(arrayChain(GOING_RSVPS)) // participant check
      .mockReturnValueOnce(singleChain(RATER_PROFILE)) // rater profile
      .mockReturnValueOnce(singleChain(RATEE_PROFILE)) // ratee profile
      .mockReturnValueOnce(submissionInsert) // submission insert
      .mockReturnValueOnce(maybeSingleChain(null)) // no prior familiarity
      .mockReturnValueOnce(familiarityUpsert) // familiarity upsert
      .mockReturnValueOnce(arrayChain(GOING_RSVPS)) // anchor: going rsvps
      .mockReturnValueOnce(arrayChain([{ internal_score: 4.0 }, { internal_score: 4.0 }])) // anchor: profiles
      .mockReturnValueOnce(profileUpdate) // profile update
      .mockReturnValueOnce(historyInsert); // rating_history insert

    const result = await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(12);
    expect(profileUpdate['update']).toHaveBeenCalledWith(
      expect.objectContaining({ internal_score: 4.06, placement_sessions_remaining: 0 }),
    );
    expect(historyInsert['insert']).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: RATEE_ID,
        session_id: SESSION_ID,
        score_before: 4.0,
        score_after: 4.06,
      }),
    );
  });

  it('decrements placement_sessions_remaining only on the first submission for the ratee in this session', async () => {
    const profileUpdate = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([])) // first submission for this ratee in session
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(RATER_PROFILE))
      .mockReturnValueOnce(singleChain({ ...RATEE_PROFILE, placement_sessions_remaining: 3 }))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(arrayChain([{ internal_score: 4.0 }, { internal_score: 4.0 }]))
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(okChain());

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');

    expect(profileUpdate['update']).toHaveBeenCalledWith(
      expect.objectContaining({ placement_sessions_remaining: 2 }),
    );
  });

  it('does not decrement placement_sessions_remaining when another rater already submitted for this ratee in this session', async () => {
    const profileUpdate = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([{ rater_id: 'someone-else' }])) // not first submission
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain(RATER_PROFILE))
      .mockReturnValueOnce(singleChain({ ...RATEE_PROFILE, placement_sessions_remaining: 3 }))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(arrayChain([{ internal_score: 4.0 }, { internal_score: 4.0 }]))
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(okChain());

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');

    expect(profileUpdate['update']).toHaveBeenCalledWith(
      expect.objectContaining({ placement_sessions_remaining: 3 }),
    );
  });

  it('flags the submission when the rater is far outside their calibration range', async () => {
    const submissionInsert = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([]))
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain({ internal_score: 8.5 }))
      .mockReturnValueOnce(singleChain(RATEE_PROFILE)) // ratee at 4.0 -> distance 4.5
      .mockReturnValueOnce(submissionInsert)
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(arrayChain([{ internal_score: 4.0 }, { internal_score: 8.5 }]))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(okChain());

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'stronger');

    expect(submissionInsert['insert']).toHaveBeenCalledWith(
      expect.objectContaining({ flagged: true }),
    );
  });

  it('persists a demotion-protection start timestamp when a vote first crosses the grade floor', async () => {
    const profileUpdate = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([]))
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain({ internal_score: 6.0 }))
      .mockReturnValueOnce(singleChain({ ...RATEE_PROFILE, internal_score: 6.0 }))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(arrayChain([{ internal_score: 5.0 }])) // anchor = 5.0
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(okChain());

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'weaker');

    const updateArg = profileUpdate['update'].mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.internal_score).toBe(6.0); // pinned at the floor, not let through below it
    expect(typeof updateArg.demotion_protection_started_at).toBe('string');
    expect(updateArg).not.toHaveProperty('promotion_protection_started_at');
  });

  it('reads an existing protection timestamp, computes elapsed days, and releases + clears it once the window has passed', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const profileUpdate = okChain();
    mockFrom
      .mockReturnValueOnce(eligibleSessionChain())
      .mockReturnValueOnce(arrayChain([]))
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(singleChain({ internal_score: 6.0 }))
      .mockReturnValueOnce(
        singleChain({ ...RATEE_PROFILE, internal_score: 6.0, demotion_protection_started_at: eightDaysAgo }),
      )
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(okChain())
      .mockReturnValueOnce(arrayChain(GOING_RSVPS))
      .mockReturnValueOnce(arrayChain([{ internal_score: 5.0 }]))
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(okChain());

    await submitRating(RATER_ID, SESSION_ID, RATEE_ID, 'weaker');

    expect(profileUpdate['update']).toHaveBeenCalledWith(
      expect.objectContaining({ internal_score: 5.99, demotion_protection_started_at: null }),
    );
  });
});