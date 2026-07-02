import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { submitRating, submitOnboardingQuiz, skipOnboarding } from '../domains/rating/rating.service.js';
import { supabase } from '../lib/supabase.js';
import {
  createTestUser,
  createSessionWithParticipants,
  truncateAll,
  closePgClient,
} from '../test/integration-helpers.js';

describe('submitRating (integration)', () => {
  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closePgClient();
  });

  it('only applies one rating update when two concurrent submissions race past the duplicate pre-check', async () => {
    // placementSessionsRemaining: 0 keeps this out of placement mode (which
    // defaults to 3 remaining on a fresh profile and uses a different
    // learning rate/clamp), so the expected delta matches the documented
    // non-placement case in rating.service.test.ts.
    const rater = await createTestUser({ internalScore: 4.0, placementSessionsRemaining: 0 });
    const ratee = await createTestUser({ internalScore: 4.0, placementSessionsRemaining: 0 });
    const session = await createSessionWithParticipants(rater.id, [ratee.id]);

    const results = await Promise.all([
      submitRating(rater.id, session.id, ratee.id, 'stronger'),
      submitRating(rater.id, session.id, ratee.id, 'stronger'),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'duplicate')).toHaveLength(1);

    const { data: historyRows } = await supabase
      .from('rating_history')
      .select('*')
      .eq('user_id', ratee.id)
      .eq('session_id', session.id);
    expect(historyRows).toHaveLength(1);

    const { data: profile } = await supabase
      .from('profiles')
      .select('internal_score')
      .eq('id', ratee.id)
      .single();
    // Single application of a 'stronger' vote at equal scores, outside placement.
    expect(profile?.internal_score).toBeCloseTo(4.06, 2);
  });
});

// ---------------------------------------------------------------------------
// completeOnboarding (shared by submitOnboardingQuiz/skipOnboarding) — the
// atomic claim-style UPDATE (`WHERE onboarding_completed_at IS NULL`) is only
// proven race-safe against a real Postgres instance; a mocked unit test can
// only fake a "0 rows returned" result, not verify the precondition is
// actually folded atomically into the UPDATE.
// ---------------------------------------------------------------------------

const VALID_ANSWERS = {
  highest_level_played: 'club_league',
  strongest_opponents: 'competitive_club',
  competitive_history: 'regional_sanctioned',
  play_frequency: 'weekly',
};

describe('completeOnboarding (integration)', () => {
  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closePgClient();
  });

  it('only completes onboarding once when two concurrent skip calls race for the same user', async () => {
    const user = await createTestUser();

    const results = await Promise.all([skipOnboarding(user.id), skipOnboarding(user.id)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'already_completed')).toHaveLength(1);

    const { data: profile } = await supabase
      .from('profiles')
      .select('internal_score, onboarding_completed_at')
      .eq('id', user.id)
      .single();
    expect(profile?.internal_score).toBe(2.75);
    expect(profile?.onboarding_completed_at).not.toBeNull();

    const { data: auditRows } = await supabase
      .from('onboarding_quiz_responses')
      .select('*')
      .eq('user_id', user.id);
    expect(auditRows).toHaveLength(1);
  });

  it('only completes onboarding once when a submit and a skip race for the same user', async () => {
    const user = await createTestUser();

    const results = await Promise.all([submitOnboardingQuiz(user.id, VALID_ANSWERS), skipOnboarding(user.id)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'already_completed')).toHaveLength(1);

    // Exactly one audit row regardless of which call won the race.
    const { data: auditRows } = await supabase
      .from('onboarding_quiz_responses')
      .select('*')
      .eq('user_id', user.id);
    expect(auditRows).toHaveLength(1);
  });
});