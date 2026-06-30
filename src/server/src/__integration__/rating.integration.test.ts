import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { submitRating } from '../domains/rating/rating.service.js';
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