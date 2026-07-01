import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { joinSession, cancelRsvp } from '../domains/session/session.service.js';
import { supabase } from '../lib/supabase.js';
import { createTestUser, truncateAll, closePgClient } from '../test/integration-helpers.js';

// Local to this file: the shared `createSessionWithParticipants` helper hardcodes
// max_players and inserts every participant as 'going', which doesn't fit the
// capacity/waitlist fixtures these concurrency tests need.
async function createTestSession(
  organizerId: string,
  fields: Partial<{ maxPlayers: number; startsAt: string }> = {},
) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      organizer_id: organizerId,
      venue_name: 'Test Venue',
      type: 'drop_in',
      format: 'casual_rotation',
      visibility: 'public',
      skill_min: 0,
      skill_max: 10,
      court_count: 1,
      max_players: fields.maxPlayers ?? 8,
      starts_at: fields.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      duration_minutes: 90,
      shuttle_policy: 'bring_your_own',
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`createTestSession failed: ${error?.message ?? 'no session returned'}`);
  }
  return data as { id: string };
}

describe('session RPCs (integration)', () => {
  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closePgClient();
  });

  it('join_session_atomic serializes two concurrent joins for the last open slot', async () => {
    const organizer = await createTestUser();
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createTestSession(organizer.id, { maxPlayers: 1 });

    const [resultA, resultB] = await Promise.all([
      joinSession(userA.id, session.id),
      joinSession(userB.id, session.id),
    ]);

    const statuses = [resultA, resultB]
      .map((r) => (r.ok ? r.status : null))
      .sort();
    expect(statuses).toEqual(['going', 'waitlisted']);

    const { data: goingRows } = await supabase
      .from('session_rsvps')
      .select('user_id')
      .eq('session_id', session.id)
      .eq('status', 'going');
    // The DB's going count must never exceed max_players, regardless of how many
    // callers raced for the slot.
    expect(goingRows).toHaveLength(1);
  });

  it('cancel_rsvp_and_promote serializes duplicate concurrent cancels — exactly one promotion, FIFO order preserved', async () => {
    const organizer = await createTestUser();
    const goingUser = await createTestUser();
    const wl1 = await createTestUser();
    const wl2 = await createTestUser();
    const session = await createTestSession(organizer.id, { maxPlayers: 1 });

    const now = Date.now();
    const { error: seedError } = await supabase.from('session_rsvps').insert([
      { session_id: session.id, user_id: goingUser.id, status: 'going', joined_at: new Date(now - 5000).toISOString() },
      { session_id: session.id, user_id: wl1.id, status: 'waitlisted', joined_at: new Date(now - 4000).toISOString() },
      { session_id: session.id, user_id: wl2.id, status: 'waitlisted', joined_at: new Date(now - 3000).toISOString() },
    ]);
    expect(seedError).toBeNull();

    // Two overlapping cancel requests for the SAME going RSVP (e.g. a client retry
    // racing its own original request). Without FOR UPDATE serializing on the
    // sessions row, both could read the waitlist before either commits and both
    // promote wl1, or worse each promote a different user out of FIFO order.
    const [resultA, resultB] = await Promise.all([
      cancelRsvp(goingUser.id, session.id),
      cancelRsvp(goingUser.id, session.id),
    ]);

    const oks = [resultA, resultB].filter((r) => r.ok);
    const fails = [resultA, resultB].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect((fails[0] as { ok: false; reason: string }).reason).toBe('not_rsvped');

    const { data: goingRows } = await supabase
      .from('session_rsvps')
      .select('user_id')
      .eq('session_id', session.id)
      .eq('status', 'going');
    // Exactly one promotion happened, and it was the oldest waitlisted user (wl1),
    // not wl2 — proving FIFO order held under the race.
    expect(goingRows).toHaveLength(1);
    expect(goingRows?.[0].user_id).toBe(wl1.id);

    const { data: wl2Row } = await supabase
      .from('session_rsvps')
      .select('status')
      .eq('session_id', session.id)
      .eq('user_id', wl2.id)
      .single();
    expect(wl2Row?.status).toBe('waitlisted');
  });

  it.each(['cancelled', 'completed'] as const)(
    'cancel_rsvp_and_promote cancels but does not promote when session status is %s',
    async (status) => {
      const organizer = await createTestUser();
      const goingUser = await createTestUser();
      const waitlisted = await createTestUser();
      const session = await createTestSession(organizer.id, { maxPlayers: 1 });

      const now = Date.now();
      await supabase.from('session_rsvps').insert([
        { session_id: session.id, user_id: goingUser.id, status: 'going', joined_at: new Date(now - 5000).toISOString() },
        { session_id: session.id, user_id: waitlisted.id, status: 'waitlisted', joined_at: new Date(now - 4000).toISOString() },
      ]);
      await supabase.from('sessions').update({ status }).eq('id', session.id);

      const result = await cancelRsvp(goingUser.id, session.id);
      expect(result).toEqual({ ok: true });

      const { data: waitlistedRow } = await supabase
        .from('session_rsvps')
        .select('status')
        .eq('session_id', session.id)
        .eq('user_id', waitlisted.id)
        .single();
      // The waitlisted user must remain waitlisted — promoting them onto a dead
      // session would create a phantom RSVP that could later earn a no-show penalty.
      expect(waitlistedRow?.status).toBe('waitlisted');

      const { data: cancelledRow } = await supabase
        .from('session_rsvps')
        .select('status')
        .eq('session_id', session.id)
        .eq('user_id', goingUser.id)
        .single();
      expect(cancelledRow?.status).toBe('cancelled');
    },
  );

  it('decrement_reliability_score clamps at 0 rather than going negative', async () => {
    const user = await createTestUser();

    const { error } = await supabase.rpc('decrement_reliability_score', {
      uids: [user.id],
      points: 1000,
    });
    expect(error).toBeNull();

    const { data: profile } = await supabase
      .from('profiles')
      .select('reliability_score')
      .eq('id', user.id)
      .single();
    expect(Number(profile?.reliability_score)).toBe(0);
  });
});