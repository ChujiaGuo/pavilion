import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from '../../../lib/supabase.js';
const mockRpc = vi.mocked(supabase.rpc);
import {
  getSessionById,
  listSessions,
  getSessionRsvps,
  getMyRsvp,
  createSession,
  updateSession,
  cancelSession,
  progressSessionStatus,
  markAttendance,
  joinSession,
  cancelRsvp,
} from '../session.service.js';

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

function makeChain() {
  const chain: Record<string, any> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['in'] = vi.fn(() => chain);
  chain['lt'] = vi.fn(() => chain);
  chain['gte'] = vi.fn(() => chain);
  chain['lte'] = vi.fn(() => chain);
  chain['order'] = vi.fn(() => chain);
  chain['limit'] = vi.fn(() => chain);
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

function arrayChain(data: any[]) {
  const chain = makeChain();
  chain.resolveAs({ data, error: null });
  return chain;
}

const mockFrom = vi.mocked(supabase.from);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'session-1';
const ORGANIZER_ID = 'organizer-1';
const USER_ID = 'user-1';

const BASE_SESSION_ROW = {
  id: SESSION_ID,
  organizer_id: ORGANIZER_ID,
  venue_id: 'venue-1',
  venue_name: 'City Rec Center',
  type: 'drop_in',
  format: 'casual_rotation',
  visibility: 'public',
  skill_min: 3.0,
  skill_max: 5.0,
  strict_range: false,
  court_count: 3,
  max_players: 12,
  starts_at: '2030-01-10T18:00:00Z',
  duration_minutes: 120,
  shuttle_policy: 'split_cost',
  shuttle_tube_price: null,
  notes: null,
  status: 'upcoming',
  is_recurring: false,
  recurring_cron_expr: null,
  parent_session_id: null,
  created_at: '2030-01-01T00:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// getSessionById
// ---------------------------------------------------------------------------

describe('getSessionById', () => {
  it('returns a mapped camelCase session when found', async () => {
    mockFrom.mockReturnValue(singleChain(BASE_SESSION_ROW) as any);

    const session = await getSessionById(SESSION_ID);
    expect(session).toMatchObject({
      id: SESSION_ID,
      organizerId: ORGANIZER_ID,
      venueName: 'City Rec Center',
      type: 'drop_in',
      skillMin: 3,
      skillMax: 5,
      status: 'upcoming',
    });
  });

  it('returns null when session does not exist', async () => {
    mockFrom.mockReturnValue(singleChain(null) as any);
    expect(await getSessionById(SESSION_ID)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns public upcoming sessions by default', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [BASE_SESSION_ROW], error: null });

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(SESSION_ID);
    expect(chain['eq']).toHaveBeenCalledWith('status', 'upcoming');
    expect(chain['eq']).toHaveBeenCalledWith('visibility', 'public');
  });

  it('filters by status when provided', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [], error: null });

    await listSessions({ status: 'completed' });
    expect(chain['eq']).toHaveBeenCalledWith('status', 'completed');
  });

  it('applies visibility=public filter when filtering by organizerId as a third-party caller', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [BASE_SESSION_ROW], error: null });

    await listSessions({ organizerId: ORGANIZER_ID });
    expect(chain['eq']).toHaveBeenCalledWith('organizer_id', ORGANIZER_ID);
    expect(chain['eq']).toHaveBeenCalledWith('visibility', 'public');
  });

  it('omits visibility filter when requestingUserId matches organizerId (owner view)', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [BASE_SESSION_ROW], error: null });

    await listSessions({ organizerId: ORGANIZER_ID, requestingUserId: ORGANIZER_ID });
    expect(chain['eq']).toHaveBeenCalledWith('organizer_id', ORGANIZER_ID);
    const eqCalls = (chain['eq'] as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls.some((args: any[]) => args[0] === 'visibility')).toBe(false);
  });

  it('filters by venueId when provided', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [], error: null });

    await listSessions({ venueId: 'venue-99' });
    expect(chain['eq']).toHaveBeenCalledWith('venue_id', 'venue-99');
  });

  it('returns empty array on DB error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: null, error: new Error('DB error') });

    expect(await listSessions()).toEqual([]);
  });

  it('applies dateFrom and dateTo filters', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [], error: null });

    await listSessions({ dateFrom: '2030-01-01T00:00:00Z', dateTo: '2030-01-31T23:59:59Z' });
    expect(chain['gte']).toHaveBeenCalledWith('starts_at', '2030-01-01T00:00:00Z');
    expect(chain['lte']).toHaveBeenCalledWith('starts_at', '2030-01-31T23:59:59Z');
  });

  it('applies skill overlap filters', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [], error: null });

    await listSessions({ skillMin: 3, skillMax: 7 });
    expect(chain['gte']).toHaveBeenCalledWith('skill_max', 3);
    expect(chain['lte']).toHaveBeenCalledWith('skill_min', 7);
  });

  it('resolves city to venue IDs and filters sessions', async () => {
    const venueChain = arrayChain([{ id: 'venue-1' }, { id: 'venue-2' }]);
    const sessionChain = makeChain();
    sessionChain.resolveAs({ data: [BASE_SESSION_ROW], error: null });
    mockFrom.mockReturnValueOnce(venueChain as any).mockReturnValueOnce(sessionChain as any);

    const sessions = await listSessions({ city: 'Toronto' });
    expect(venueChain['eq']).toHaveBeenCalledWith('city', 'Toronto');
    expect(sessionChain['in']).toHaveBeenCalledWith('venue_id', ['venue-1', 'venue-2']);
    expect(sessions).toHaveLength(1);
  });

  it('returns empty array when no venues match city', async () => {
    const venueChain = arrayChain([]);
    mockFrom.mockReturnValueOnce(venueChain as any);

    expect(await listSessions({ city: 'Nowhere' })).toEqual([]);
  });

  it('applies both city and region filters to venue query', async () => {
    const venueChain = arrayChain([{ id: 'venue-3' }]);
    const sessionChain = makeChain();
    sessionChain.resolveAs({ data: [], error: null });
    mockFrom.mockReturnValueOnce(venueChain as any).mockReturnValueOnce(sessionChain as any);

    await listSessions({ city: 'Vancouver', region: 'BC' });
    expect(venueChain['eq']).toHaveBeenCalledWith('city', 'Vancouver');
    expect(venueChain['eq']).toHaveBeenCalledWith('region', 'BC');
  });

  it('returns sessions a user is attending', async () => {
    const profileChain = singleChain({ privacy_level: 'public' });
    const rsvpChain = arrayChain([{ session_id: SESSION_ID }]);
    const sessionChain = makeChain();
    sessionChain.resolveAs({ data: [BASE_SESSION_ROW], error: null });
    mockFrom
      .mockReturnValueOnce(profileChain as any)
      .mockReturnValueOnce(rsvpChain as any)
      .mockReturnValueOnce(sessionChain as any);

    const sessions = await listSessions({ attendeeId: USER_ID });
    expect(sessionChain['in']).toHaveBeenCalledWith('id', [SESSION_ID]);
    expect(sessions).toHaveLength(1);
  });

  it('returns empty array when attendee has no active RSVPs', async () => {
    const profileChain = singleChain({ privacy_level: 'public' });
    const rsvpChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(profileChain as any)
      .mockReturnValueOnce(rsvpChain as any);

    expect(await listSessions({ attendeeId: USER_ID })).toEqual([]);
  });

  it('returns empty array when viewing private attendee as another user', async () => {
    const profileChain = singleChain({ privacy_level: 'private' });
    mockFrom.mockReturnValueOnce(profileChain as any);

    expect(await listSessions({ attendeeId: USER_ID, requestingUserId: 'other-user' })).toEqual([]);
  });

  it('allows viewing own private session history', async () => {
    const profileChain = singleChain({ privacy_level: 'private' });
    const rsvpChain = arrayChain([{ session_id: SESSION_ID }]);
    const sessionChain = makeChain();
    sessionChain.resolveAs({ data: [BASE_SESSION_ROW], error: null });
    mockFrom
      .mockReturnValueOnce(profileChain as any)
      .mockReturnValueOnce(rsvpChain as any)
      .mockReturnValueOnce(sessionChain as any);

    const sessions = await listSessions({ attendeeId: USER_ID, requestingUserId: USER_ID });
    expect(sessions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

const CREATE_FIELDS = {
  venueName: 'City Rec Center',
  type: 'drop_in' as const,
  format: 'casual_rotation' as const,
  visibility: 'public' as const,
  skillMin: 3.0,
  skillMax: 5.0,
  courtCount: 3,
  maxPlayers: 12,
  startsAt: '2030-01-10T18:00:00Z',
  durationMinutes: 120,
  shuttlePolicy: 'split_cost' as const,
};

describe('createSession', () => {
  it('creates a session without warning when organizer grade is near the range', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any) // profile fetch
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any); // insert

    const result = await createSession(ORGANIZER_ID, CREATE_FIELDS);
    expect(result).not.toBeNull();
    expect(result?.session.id).toBe(SESSION_ID);
    expect(result?.warning).toBeUndefined();
  });

  it('returns skill_range_wide warning when organizer grade is far from both ends', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ internal_score: 8.0 }) as any) // grade 8, far from 3-5
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any);

    const result = await createSession(ORGANIZER_ID, CREATE_FIELDS);
    expect(result?.warning).toBe('skill_range_wide');
  });

  it('does not warn when organizer grade is within 1.5 of one end', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ internal_score: 6.0 }) as any) // grade 6, within 1.5 of skillMax 5
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any);

    const result = await createSession(ORGANIZER_ID, CREATE_FIELDS);
    expect(result?.warning).toBeUndefined();
  });

  it('still creates the session if profile fetch fails (no warning)', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain(null) as any) // profile not found
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any);

    const result = await createSession(ORGANIZER_ID, CREATE_FIELDS);
    expect(result?.session).toBeDefined();
    expect(result?.warning).toBeUndefined();
  });

  it('returns null on DB insert error', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any)
      .mockReturnValueOnce(singleChain(null) as any);

    expect(await createSession(ORGANIZER_ID, CREATE_FIELDS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateSession
// ---------------------------------------------------------------------------

describe('updateSession', () => {
  it('returns updated session when organizer updates their own session', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...BASE_SESSION_ROW, notes: 'bring water' },
      error: null,
    });

    const session = await updateSession(SESSION_ID, ORGANIZER_ID, { notes: 'bring water' });
    expect(session?.notes).toBe('bring water');
  });

  it('maps camelCase fields to snake_case DB columns', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: BASE_SESSION_ROW, error: null });

    await updateSession(SESSION_ID, ORGANIZER_ID, { maxPlayers: 16, durationMinutes: 90 });
    expect(chain['update']).toHaveBeenCalledWith(
      expect.objectContaining({ max_players: 16, duration_minutes: 90 }),
    );
  });

  it('returns null when session not found or user is not organizer', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('no rows') });

    expect(await updateSession(SESSION_ID, 'other-user', { notes: 'x' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelSession
// ---------------------------------------------------------------------------

describe('cancelSession', () => {
  it('returns true when organizer cancels their upcoming session', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [{ id: SESSION_ID }], error: null });
    expect(await cancelSession(SESSION_ID, ORGANIZER_ID)).toBe(true);
  });

  it('returns false when DB returns an error (not organizer or not upcoming)', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ error: new Error('no rows') });
    expect(await cancelSession(SESSION_ID, 'other-user')).toBe(false);
  });

  it('returns false when update matches zero rows (wrong organizer, wrong status, or non-existent session)', async () => {
    // Postgres issues no error on a 0-row update — only checking `!error` would incorrectly
    // return true here. The fix reads back affected rows and checks data.length > 0.
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: [], error: null });
    expect(await cancelSession(SESSION_ID, 'other-user')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// progressSessionStatus
// ---------------------------------------------------------------------------

describe('progressSessionStatus', () => {
  it('advances upcoming → active', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ status: 'upcoming', organizer_id: ORGANIZER_ID }) as any)
      .mockReturnValueOnce(singleChain({ ...BASE_SESSION_ROW, status: 'active' }) as any);

    const result = await progressSessionStatus(SESSION_ID, ORGANIZER_ID);
    expect(result).toEqual({ ok: true, session: expect.objectContaining({ status: 'active' }) });
  });

  it('advances active → completed', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ status: 'active', organizer_id: ORGANIZER_ID }) as any)
      .mockReturnValueOnce(singleChain({ ...BASE_SESSION_ROW, status: 'completed' }) as any);

    const result = await progressSessionStatus(SESSION_ID, ORGANIZER_ID);
    expect(result).toEqual({ ok: true, session: expect.objectContaining({ status: 'completed' }) });
  });

  it('returns not_found when session does not exist', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any);

    expect(await progressSessionStatus(SESSION_ID, ORGANIZER_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('returns forbidden when caller is not the organizer', async () => {
    mockFrom.mockReturnValueOnce(
      singleChain({ status: 'upcoming', organizer_id: ORGANIZER_ID }) as any,
    );

    expect(await progressSessionStatus(SESSION_ID, 'other-user')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('returns invalid_transition for completed sessions', async () => {
    mockFrom.mockReturnValueOnce(
      singleChain({ status: 'completed', organizer_id: ORGANIZER_ID }) as any,
    );

    expect(await progressSessionStatus(SESSION_ID, ORGANIZER_ID)).toEqual({
      ok: false,
      reason: 'invalid_transition',
    });
  });

  it('returns invalid_transition for cancelled sessions', async () => {
    mockFrom.mockReturnValueOnce(
      singleChain({ status: 'cancelled', organizer_id: ORGANIZER_ID }) as any,
    );

    expect(await progressSessionStatus(SESSION_ID, ORGANIZER_ID)).toEqual({
      ok: false,
      reason: 'invalid_transition',
    });
  });
});

// ---------------------------------------------------------------------------
// markAttendance
// ---------------------------------------------------------------------------

const COMPLETED_SESSION = { status: 'completed', organizer_id: ORGANIZER_ID };

describe('markAttendance', () => {
  it('returns not_found when session does not exist', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any);
    expect(await markAttendance(SESSION_ID, ORGANIZER_ID, [])).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('returns forbidden when caller is not organizer', async () => {
    mockFrom.mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any);
    expect(await markAttendance(SESSION_ID, 'other-user', [])).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('returns not_completed when session is not completed', async () => {
    mockFrom.mockReturnValueOnce(
      singleChain({ status: 'upcoming', organizer_id: ORGANIZER_ID }) as any,
    );
    expect(await markAttendance(SESSION_ID, ORGANIZER_ID, [])).toEqual({
      ok: false,
      reason: 'not_completed',
    });
  });

  it('marks attended users and calls RPC atomically for no-shows', async () => {
    const attendedId = 'user-attended';
    const noShowId = 'user-noshow';
    mockRpc.mockResolvedValue({ data: null, error: null } as any);

    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any) // session fetch
      .mockReturnValueOnce(
        arrayChain([{ user_id: attendedId }, { user_id: noShowId }]) as any, // going RSVPs
      )
      .mockReturnValueOnce(arrayChain([{ user_id: attendedId }]) as any) // update attended status (affected rows)
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any); // update no_show status (affected rows)

    const result = await markAttendance(SESSION_ID, ORGANIZER_ID, [attendedId]);
    expect(result).toEqual({ ok: true, attended: 1, noShows: 1 });
    // Single RPC call — no profile SELECT or JS score computation
    expect(mockRpc).toHaveBeenCalledWith('decrement_reliability_score', {
      uids: [noShowId],
      points: 10,
    });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it('skips rpc and no_show update when all going users attended', async () => {
    const attendedId = 'user-1';

    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any)
      .mockReturnValueOnce(arrayChain([{ user_id: attendedId }]) as any)
      .mockReturnValueOnce(arrayChain([{ user_id: attendedId }]) as any); // attended update only, affected rows

    const result = await markAttendance(SESSION_ID, ORGANIZER_ID, [attendedId]);
    expect(result).toEqual({ ok: true, attended: 1, noShows: 0 });
    // exactly 3 from() calls: session, going RSVPs, attended update
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns write_failed and does not decrement when the reliability-score RPC errors', async () => {
    const noShowId = 'user-noshow';
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('rpc unavailable') } as any);

    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any) // session fetch
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any) // going RSVPs
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any); // no_show update affected rows

    const result = await markAttendance(SESSION_ID, ORGANIZER_ID, []);
    expect(result).toEqual({ ok: false, reason: 'write_failed' });
    expect(mockRpc).toHaveBeenCalledWith('decrement_reliability_score', {
      uids: [noShowId],
      points: 10,
    });
  });

  it('only invokes the no-show RPC once across two overlapping calls for the same user', async () => {
    // Simulates two calls whose `going` reads both happen before either write commits.
    // Call 1's no-show UPDATE actually flips the row and its .select() returns it, so the
    // RPC fires for that user. Call 2 reads the same stale 'going' snapshot, but by the time
    // its UPDATE runs the row is no longer 'going' (call 1 already flipped it) — the
    // .eq('status', 'going') guard means call 2's UPDATE affects zero rows, its .select()
    // returns none, and it must skip the RPC penalty rather than double-deduct.
    const noShowId = 'user-noshow';
    mockRpc.mockResolvedValue({ data: null, error: null } as any);

    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any) // call 1: session
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any) // call 1: going RSVPs
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any) // call 1: no_show update actually affects the row
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any) // call 2: session
      .mockReturnValueOnce(arrayChain([{ user_id: noShowId }]) as any) // call 2: stale going read (race)
      .mockReturnValueOnce(arrayChain([]) as any); // call 2: no_show update affects nothing (already flipped)

    const result1 = await markAttendance(SESSION_ID, ORGANIZER_ID, []);
    const result2 = await markAttendance(SESSION_ID, ORGANIZER_ID, []);

    expect(result1).toEqual({ ok: true, attended: 0, noShows: 1 });
    expect(result2).toEqual({ ok: true, attended: 0, noShows: 0 });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('decrement_reliability_score', {
      uids: [noShowId],
      points: 10,
    });
  });

  it('is idempotent — only processes going RSVPs, ignores already-processed ones', async () => {
    // Empty going RSVPs (all already processed in a prior call)
    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any)
      .mockReturnValueOnce(arrayChain([]) as any);

    const result = await markAttendance(SESSION_ID, ORGANIZER_ID, []);
    expect(result).toEqual({ ok: true, attended: 0, noShows: 0 });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('returns write_failed and stops early when the attended-status write fails', async () => {
    // Scenario: the DB write to flip going → attended errors mid-operation.
    // The function must NOT proceed to mark no-shows or fire the RPC penalty —
    // doing so would penalise users who were never confirmed as absent.
    const attendedId = 'user-attended';
    const noShowId = 'user-noshow';

    const errorChain = makeChain();
    errorChain.resolveAs({ data: null, error: new Error('connection lost') });

    mockFrom
      .mockReturnValueOnce(singleChain(COMPLETED_SESSION) as any)          // session fetch
      .mockReturnValueOnce(arrayChain([{ user_id: attendedId }, { user_id: noShowId }]) as any) // going RSVPs
      .mockReturnValueOnce(errorChain as any);                              // attended write FAILS

    const result = await markAttendance(SESSION_ID, ORGANIZER_ID, [attendedId]);
    expect(result).toEqual({ ok: false, reason: 'write_failed' });
    // Exactly 3 from() calls — function halted before the no_show update (4th call)
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinSession
// ---------------------------------------------------------------------------

const UPCOMING_SESSION_CHAIN = () => singleChain(BASE_SESSION_ROW);
const PAST_SESSION = { ...BASE_SESSION_ROW, status: 'completed' };
const INVITE_ONLY_SESSION = { ...BASE_SESSION_ROW, visibility: 'invite_only' };
const FULL_SESSION = { ...BASE_SESSION_ROW, max_players: 1 };

describe('joinSession', () => {
  it('returns not_found when session does not exist', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns not_open when session is not upcoming', async () => {
    mockFrom.mockReturnValueOnce(singleChain(PAST_SESSION) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'not_open' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('allows a non-organizer to join an invite_only session, subject to normal checks', async () => {
    // invite_only is a visibility/discoverability control only — anyone with the
    // session ID may join, subject to the same capacity/skill checks as public sessions.
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(singleChain(INVITE_ONLY_SESSION) as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any) // no existing RSVP
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'going' });
    expect(mockRpc).toHaveBeenCalledWith('join_session_atomic', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  it('still applies skill_blocked on an invite_only session for a non-organizer', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain(INVITE_ONLY_SESSION) as any) // skill_min: 3.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 1.0 }) as any); // 2.0 below floor

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'skill_blocked' });
  });

  it('allows organizer to join their own invite_only session', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(singleChain(INVITE_ONLY_SESSION) as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any); // no existing RSVP

    const result = await joinSession(ORGANIZER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'going' });
    expect(mockRpc).toHaveBeenCalledWith('join_session_atomic', {
      p_session_id: SESSION_ID,
      p_user_id: ORGANIZER_ID,
    });
  });

  it('returns already_rsvped when user is already going', async () => {
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any)
      .mockReturnValueOnce(maybeSingleChain({ status: 'going' }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'already_rsvped' });
  });

  it('returns already_rsvped when user is already waitlisted', async () => {
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any)
      .mockReturnValueOnce(maybeSingleChain({ status: 'waitlisted' }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'already_rsvped' });
  });

  it('returns skill_blocked when player is more than 1.5 below session floor', async () => {
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_min: 3.0
      .mockReturnValueOnce(maybeSingleChain(null) as any) // no existing RSVP
      .mockReturnValueOnce(singleChain({ internal_score: 1.0 }) as any); // 1.0 → 2.0 below floor

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'skill_blocked' });
  });

  it('returns playing_up warning when player is within 1.5 of floor', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_min: 3.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 2.0 }) as any); // 1.0 below floor

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, warning: 'playing_up' });
  });

  it('returns skill_blocked when player is more than 3.0 above session ceiling', async () => {
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_max: 5.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 8.5 }) as any); // 3.5 above ceiling

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'skill_blocked' });
  });

  it('returns playing_down warning when player is within 3.0 above ceiling', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_max: 5.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 7.0 }) as any); // 2.0 above ceiling

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, warning: 'playing_down' });
  });

  it('returns going status when session has capacity', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'going' });
    expect(mockRpc).toHaveBeenCalledWith('join_session_atomic', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  it('returns waitlisted status when session is full', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'waitlisted', error: null } as any);
    mockFrom
      .mockReturnValueOnce(singleChain(FULL_SESSION) as any) // max_players: 1
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'waitlisted' });
  });

  // -------------------------------------------------------------------------
  // Skill boundary proofs — BASE_SESSION_ROW has skill_min: 3.0, skill_max: 5.0
  // Block thresholds: playing_up > 1.5, playing_down > 3.0  (strict inequality)
  // -------------------------------------------------------------------------

  it('boundary: exact floor match (score = skillMin) proceeds with no warning', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_min: 3.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 3.0 }) as any); // playingUp = 0

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'going' });
    expect((result as any).warning).toBeUndefined();
  });

  it('boundary: exact ceiling match (score = skillMax) proceeds with no warning', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any) // skill_max: 5.0
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 5.0 }) as any); // playingDown = 0

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, status: 'going' });
    expect((result as any).warning).toBeUndefined();
  });

  it('boundary: score exactly 1.5 below floor issues playing_up warning but is NOT blocked', async () => {
    // playingUp = 3.0 - 1.5 = 1.5; threshold is > 1.5 (strict), so 1.5 is NOT blocked
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 1.5 }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, warning: 'playing_up' });
  });

  it('boundary: score exactly 3.0 above ceiling issues playing_down warning but is NOT blocked', async () => {
    // playingDown = 8.0 - 5.0 = 3.0; threshold is > 3.0 (strict), so 3.0 is NOT blocked
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom
      .mockReturnValueOnce(UPCOMING_SESSION_CHAIN() as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain({ internal_score: 8.0 }) as any);

    const result = await joinSession(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ ok: true, warning: 'playing_down' });
  });

  // -------------------------------------------------------------------------
  // Deterministic concurrency proof — two callers race for the last slot
  // -------------------------------------------------------------------------

  it('concurrency: two simultaneous joins for the last slot are serialized by join_session_atomic', async () => {
    // Promise.all interleaves both joinSession calls across the single JS thread.
    // Both pass all pre-checks and both dispatch join_session_atomic to the DB.
    // The DB RPC (not the JS layer) decides who wins the slot — the mock simulates
    // the DB serialising the writes: caller A gets 'going', caller B gets 'waitlisted'.
    //
    // from() call ordering under Promise.all interleaving (deterministic in Node microtasks):
    //   [0] A: session fetch   [1] B: session fetch
    //   [2] A: RSVP check      [3] B: RSVP check
    //   [4] A: profile fetch   [5] B: profile fetch
    // rpc() ordering:
    //   [0] A: join_session_atomic → 'going'
    //   [1] B: join_session_atomic → 'waitlisted'
    const USER_A = 'user-a';
    const USER_B = 'user-b';

    mockFrom
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any)         // A: session
      .mockReturnValueOnce(singleChain(BASE_SESSION_ROW) as any)         // B: session
      .mockReturnValueOnce(maybeSingleChain(null) as any)                // A: RSVP check
      .mockReturnValueOnce(maybeSingleChain(null) as any)                // B: RSVP check
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any)  // A: profile
      .mockReturnValueOnce(singleChain({ internal_score: 4.0 }) as any); // B: profile

    mockRpc
      .mockResolvedValueOnce({ data: 'going', error: null } as any)      // A wins the slot
      .mockResolvedValueOnce({ data: 'waitlisted', error: null } as any); // B is waitlisted

    const [resultA, resultB] = await Promise.all([
      joinSession(USER_A, SESSION_ID),
      joinSession(USER_B, SESSION_ID),
    ]);

    expect(resultA).toMatchObject({ ok: true, status: 'going' });
    expect(resultB).toMatchObject({ ok: true, status: 'waitlisted' });
    // Both callers dispatched the atomic RPC — the DB serialised them, not the JS layer
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith('join_session_atomic', { p_session_id: SESSION_ID, p_user_id: USER_A });
    expect(mockRpc).toHaveBeenCalledWith('join_session_atomic', { p_session_id: SESSION_ID, p_user_id: USER_B });
    expect(mockFrom).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
// cancelRsvp
// ---------------------------------------------------------------------------

describe('cancelRsvp', () => {
  it('returns not_found when session does not exist', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns not_rsvped when user has no active RSVP', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'not_rsvped', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2030-01-10T18:00:00Z', status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'not_rsvped' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns not_rsvped when RSVP is already cancelled', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'not_rsvped', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2030-01-10T18:00:00Z', status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: false, reason: 'not_rsvped' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('cancels a waitlisted RSVP without promotion or late-cancel penalty', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'waitlisted', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2030-01-10T18:00:00Z', status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(1); // only cancel_rsvp_and_promote, no decrement
    expect(mockRpc).toHaveBeenCalledWith('cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  it('cancels a going RSVP and promotes oldest waitlisted user atomically (on-time cancel)', async () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: futureStart, status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    // On-time cancel: no decrement RPC; promotion is handled inside cancel_rsvp_and_promote
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  it('calls decrement_reliability_score RPC atomically on late cancel', async () => {
    const soonStart = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    mockRpc
      .mockResolvedValueOnce({ data: 'going', error: null } as any)   // cancel_rsvp_and_promote
      .mockResolvedValueOnce({ data: null, error: null } as any);     // decrement_reliability_score

    mockFrom.mockReturnValueOnce(singleChain({ starts_at: soonStart, status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
    // No JS score computation — GREATEST(0, score - 5) is computed in Postgres
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'decrement_reliability_score', {
      uids: [USER_ID],
      points: 5,
    });
  });

  it('passes fixed penalty to RPC regardless of current score (clamping is DB-side)', async () => {
    const soonStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockRpc
      .mockResolvedValueOnce({ data: 'going', error: null } as any)
      .mockResolvedValueOnce({ data: null, error: null } as any);

    mockFrom.mockReturnValueOnce(singleChain({ starts_at: soonStart, status: 'upcoming' }) as any);

    await cancelRsvp(USER_ID, SESSION_ID);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'decrement_reliability_score', {
      uids: [USER_ID],
      points: 5,
    });
  });

  it('skips decrement when going RSVP is cancelled on time', async () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: futureStart, status: 'upcoming' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    // Exactly one RPC call — cancel_rsvp_and_promote only; no decrement
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('logs and still reports success when decrement_reliability_score RPC fails on late cancel', async () => {
    // The cancel itself (cancel_rsvp_and_promote) already committed — a failure to apply
    // the late-cancel penalty must not be reported as a failed cancel.
    const soonStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const rpcError = new Error('rpc unavailable');
    mockRpc
      .mockResolvedValueOnce({ data: 'going', error: null } as any) // cancel_rsvp_and_promote
      .mockResolvedValueOnce({ data: null, error: rpcError } as any); // decrement_reliability_score fails

    mockFrom.mockReturnValueOnce(singleChain({ starts_at: soonStart, status: 'upcoming' }) as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true, warning: 'penalty_not_applied' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(USER_ID), rpcError);
    consoleErrorSpy.mockRestore();
  });

  it('skips late-cancel penalty when session is no longer upcoming', async () => {
    // starts_at is in the past (session is active/completed) — without the status guard
    // the isLate check would fire since Date.now() > startsAt - HOURS_12_MS
    const pastStart = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: pastStart, status: 'active' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    // Only cancel_rsvp_and_promote; decrement must NOT fire for active/completed sessions
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  // ---------------------------------------------------------------------------
  // Dead-session promotion guard — cancel_rsvp_and_promote itself (not this JS
  // layer) decides whether to promote, based on the session's status. These tests
  // confirm the JS caller still dispatches the RPC and reports success regardless
  // of session status; the promote-vs-skip decision is verified against real
  // Postgres in session.integration.test.ts.
  // ---------------------------------------------------------------------------

  it('cancels a going RSVP on a cancelled session without promoting (RPC-level guard)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2030-01-10T18:00:00Z', status: 'cancelled' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });

  it('cancels a going RSVP on a completed session without promoting (RPC-level guard)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'going', error: null } as any);
    mockFrom.mockReturnValueOnce(singleChain({ starts_at: '2030-01-10T18:00:00Z', status: 'completed' }) as any);

    const result = await cancelRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('cancel_rsvp_and_promote', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// getSessionRsvps
// ---------------------------------------------------------------------------

describe('getSessionRsvps', () => {
  it('returns mapped going and waitlisted RSVPs ordered by joinedAt', async () => {
    const rows = [
      { session_id: SESSION_ID, user_id: USER_ID, status: 'going', joined_at: '2030-01-05T00:00:00Z' },
      { session_id: SESSION_ID, user_id: 'user-2', status: 'waitlisted', joined_at: '2030-01-06T00:00:00Z' },
    ];
    const rsvpChain = arrayChain(rows);
    const profileChain = arrayChain([
      { id: USER_ID, privacy_level: 'public' },
      { id: 'user-2', privacy_level: 'public' },
    ]);
    mockFrom.mockReturnValueOnce(rsvpChain as any).mockReturnValueOnce(profileChain as any);

    const rsvps = await getSessionRsvps(SESSION_ID);
    expect(rsvps).toHaveLength(2);
    expect(rsvps[0]).toMatchObject({ sessionId: SESSION_ID, userId: USER_ID, status: 'going' });
  });

  it('returns empty array on DB error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain.resolveAs({ data: null, error: new Error('DB error') });

    expect(await getSessionRsvps(SESSION_ID)).toEqual([]);
  });

  it('excludes RSVPs belonging to private-profile users', async () => {
    const rows = [
      { session_id: SESSION_ID, user_id: USER_ID, status: 'going', joined_at: '2030-01-05T00:00:00Z' },
      { session_id: SESSION_ID, user_id: 'user-2', status: 'waitlisted', joined_at: '2030-01-06T00:00:00Z' },
    ];
    const rsvpChain = arrayChain(rows);
    const profileChain = arrayChain([
      { id: USER_ID, privacy_level: 'public' },
      { id: 'user-2', privacy_level: 'private' },
    ]);
    mockFrom.mockReturnValueOnce(rsvpChain as any).mockReturnValueOnce(profileChain as any);

    const rsvps = await getSessionRsvps(SESSION_ID);
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].userId).toBe(USER_ID);
  });
});

// ---------------------------------------------------------------------------
// getMyRsvp
// ---------------------------------------------------------------------------

function countChain(count: number) {
  const chain = makeChain();
  chain.resolveAs({ count, data: null, error: null });
  return chain;
}

describe('getMyRsvp', () => {
  it('returns null when user has no RSVP', async () => {
    mockFrom.mockReturnValueOnce(maybeSingleChain(null) as any);
    expect(await getMyRsvp(USER_ID, SESSION_ID)).toBeNull();
  });

  it('returns null when RSVP is cancelled', async () => {
    mockFrom.mockReturnValueOnce(maybeSingleChain({ status: 'cancelled', joined_at: '2030-01-05T00:00:00Z' }) as any);
    expect(await getMyRsvp(USER_ID, SESSION_ID)).toBeNull();
  });

  it('returns going status without waitlistPosition', async () => {
    mockFrom.mockReturnValueOnce(
      maybeSingleChain({ status: 'going', joined_at: '2030-01-05T00:00:00Z' }) as any,
    );

    const result = await getMyRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ status: 'going', joinedAt: '2030-01-05T00:00:00Z' });
    expect(mockFrom).toHaveBeenCalledTimes(1); // no count query needed
  });

  it('returns waitlisted status with position 1 when first in queue', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleChain({ status: 'waitlisted', joined_at: '2030-01-05T00:00:00Z' }) as any)
      .mockReturnValueOnce(countChain(0) as any); // 0 before them → position 1

    const result = await getMyRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ status: 'waitlisted', joinedAt: '2030-01-05T00:00:00Z', waitlistPosition: 1 });
  });

  it('returns waitlisted status with correct position when others are ahead', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleChain({ status: 'waitlisted', joined_at: '2030-01-07T00:00:00Z' }) as any)
      .mockReturnValueOnce(countChain(3) as any); // 3 ahead → position 4

    const result = await getMyRsvp(USER_ID, SESSION_ID);
    expect(result).toMatchObject({ status: 'waitlisted', waitlistPosition: 4 });
  });

  it('returns attended status when RSVP is attended', async () => {
    mockFrom.mockReturnValueOnce(
      maybeSingleChain({ status: 'attended', joined_at: '2030-01-05T00:00:00Z' }) as any,
    );

    const result = await getMyRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ status: 'attended', joinedAt: '2030-01-05T00:00:00Z' });
    expect(mockFrom).toHaveBeenCalledTimes(1); // no waitlist count query
  });

  it('returns no_show status when RSVP is no_show', async () => {
    mockFrom.mockReturnValueOnce(
      maybeSingleChain({ status: 'no_show', joined_at: '2030-01-05T00:00:00Z' }) as any,
    );

    const result = await getMyRsvp(USER_ID, SESSION_ID);
    expect(result).toEqual({ status: 'no_show', joinedAt: '2030-01-05T00:00:00Z' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});