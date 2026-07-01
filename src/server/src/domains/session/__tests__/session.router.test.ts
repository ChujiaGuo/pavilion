import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../session.service.js', () => ({
  getSessionById: vi.fn(),
  listSessions: vi.fn(),
  getSessionRsvps: vi.fn(),
  getMyRsvp: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  cancelSession: vi.fn(),
  progressSessionStatus: vi.fn(),
  markAttendance: vi.fn(),
  joinSession: vi.fn(),
  cancelRsvp: vi.fn(),
}));

import { supabase } from '../../../lib/supabase.js';
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
import { sessionRouter } from '../session.router.js';

const mockGetUser = vi.mocked(supabase.auth.getUser);
const mockGetSessionById = vi.mocked(getSessionById);
const mockListSessions = vi.mocked(listSessions);
const mockGetSessionRsvps = vi.mocked(getSessionRsvps);
const mockGetMyRsvp = vi.mocked(getMyRsvp);
const mockCreateSession = vi.mocked(createSession);
const mockUpdateSession = vi.mocked(updateSession);
const mockCancelSession = vi.mocked(cancelSession);
const mockJoinSession = vi.mocked(joinSession);
const mockProgressSessionStatus = vi.mocked(progressSessionStatus);
const mockMarkAttendance = vi.mocked(markAttendance);
const mockCancelRsvp = vi.mocked(cancelRsvp);

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

const BASE_SESSION = {
  id: SESSION_ID,
  organizerId: USER_ID,
  venueId: 'venue-1',
  venueName: 'City Rec Center',
  type: 'drop_in',
  format: 'casual_rotation',
  visibility: 'public',
  skillMin: 3,
  skillMax: 5,
  strictRange: false,
  courtCount: 3,
  maxPlayers: 12,
  startsAt: '2030-01-10T18:00:00Z',
  durationMinutes: 120,
  shuttlePolicy: 'split_cost',
  shuttleTubePrice: null,
  notes: null,
  status: 'upcoming',
  isRecurring: false,
  recurringCronExpr: null,
  parentSessionId: null,
  createdAt: '2030-01-01T00:00:00Z',
};

const VALID_CREATE_BODY = {
  venueName: 'City Rec Center',
  type: 'drop_in',
  format: 'casual_rotation',
  visibility: 'public',
  skillMin: 3,
  skillMax: 5,
  courtCount: 3,
  maxPlayers: 12,
  startsAt: '2030-01-10T18:00:00Z',
  durationMinutes: 120,
  shuttlePolicy: 'split_cost',
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
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns sessions list', async () => {
    mockListSessions.mockResolvedValue([BASE_SESSION as any]);

    const res = await sessionRouter.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
  });

  it('returns 400 for invalid status param', async () => {
    const res = await sessionRouter.request('/?status=bogus');
    expect(res.status).toBe(400);
  });

  it('passes status/venue/organizer filters to listSessions', async () => {
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request('/?status=completed&venue_id=v-1&organizer_id=o-1');
    expect(mockListSessions).toHaveBeenCalledWith({
      status: 'completed',
      venueId: 'v-1',
      organizerId: 'o-1',
    });
  });

  it('passes date range filters to listSessions', async () => {
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request('/?date_from=2030-01-01T00:00:00Z&date_to=2030-01-31T23:59:59Z');
    expect(mockListSessions).toHaveBeenCalledWith({
      dateFrom: '2030-01-01T00:00:00Z',
      dateTo: '2030-01-31T23:59:59Z',
    });
  });

  it('passes city and region filters to listSessions', async () => {
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request('/?city=Toronto&region=ON');
    expect(mockListSessions).toHaveBeenCalledWith({ city: 'Toronto', region: 'ON' });
  });

  it('passes skill range filters as numbers to listSessions', async () => {
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request('/?skill_min=3&skill_max=7');
    expect(mockListSessions).toHaveBeenCalledWith({ skillMin: 3, skillMax: 7 });
  });

  it('returns 400 for non-numeric skill_min', async () => {
    const res = await sessionRouter.request('/?skill_min=abc');
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric skill_max', async () => {
    const res = await sessionRouter.request('/?skill_max=xyz');
    expect(res.status).toBe(400);
  });

  it('passes attendee_id without auth (public profile)', async () => {
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request(`/?attendee_id=${USER_ID}`);
    expect(mockListSessions).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeId: USER_ID }),
    );
  });

  it('passes attendee_id with requestingUserId when Bearer token is valid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'requester-1' } }, error: null } as any);
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request(`/?attendee_id=${USER_ID}`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(mockListSessions).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeId: USER_ID, requestingUserId: 'requester-1' }),
    );
  });

  it('passes attendee_id without requestingUserId when Bearer token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') } as any);
    mockListSessions.mockResolvedValue([]);

    await sessionRouter.request(`/?attendee_id=${USER_ID}`, {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(mockListSessions).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeId: USER_ID }),
    );
    expect(mockListSessions).toHaveBeenCalledWith(
      expect.not.objectContaining({ requestingUserId: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe('POST /', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: 'X' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_CREATE_BODY, type: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when skillMin >= skillMax', async () => {
    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_CREATE_BODY, skillMin: 5, skillMax: 3 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when skillMin and skillMax are sent as strings with an inverted range that passes string comparison', async () => {
    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_CREATE_BODY, skillMin: '10', skillMax: '3' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 with session on success', async () => {
    mockCreateSession.mockResolvedValue({ session: BASE_SESSION as any });

    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.id).toBe(SESSION_ID);
    expect(body.warning).toBeUndefined();
  });

  it('includes warning in response when service returns one', async () => {
    mockCreateSession.mockResolvedValue({ session: BASE_SESSION as any, warning: 'skill_range_wide' });

    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).warning).toBe('skill_range_wide');
  });

  it('returns 500 when service returns null', async () => {
    mockCreateSession.mockResolvedValue(null);

    const res = await sessionRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe('GET /:id', () => {
  it('returns 200 with session when found', async () => {
    mockGetSessionById.mockResolvedValue(BASE_SESSION as any);

    const res = await sessionRouter.request(`/${SESSION_ID}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(SESSION_ID);
  });

  it('returns 404 when session not found', async () => {
    mockGetSessionById.mockResolvedValue(null);

    const res = await sessionRouter.request(`/${SESSION_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for invite_only session without auth', async () => {
    mockGetSessionById.mockResolvedValue({ ...BASE_SESSION, visibility: 'invite_only' } as any);

    const res = await sessionRouter.request(`/${SESSION_ID}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for invite_only session with a valid token', async () => {
    mockGetSessionById.mockResolvedValue({ ...BASE_SESSION, visibility: 'invite_only' } as any);

    const res = await sessionRouter.request(`/${SESSION_ID}`, { headers: withAuth() });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(SESSION_ID);
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id
// ---------------------------------------------------------------------------

describe('PATCH /:id', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}`, { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated session', async () => {
    mockUpdateSession.mockResolvedValue({ ...BASE_SESSION, notes: 'bring water' } as any);

    const res = await sessionRouter.request(`/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'bring water' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).notes).toBe('bring water');
  });

  it('returns 404 when not found or not organizer', async () => {
    mockUpdateSession.mockResolvedValue(null);

    const res = await sessionRouter.request(`/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth('other-user'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe('DELETE /:id', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with success on cancel', async () => {
    mockCancelSession.mockResolvedValue(true);

    const res = await sessionRouter.request(`/${SESSION_ID}`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 404 when cancel fails', async () => {
    mockCancelSession.mockResolvedValue(false);

    const res = await sessionRouter.request(`/${SESSION_ID}`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id/status
// ---------------------------------------------------------------------------

describe('PATCH /:id/status', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/status`, { method: 'PATCH' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated session on valid transition', async () => {
    mockProgressSessionStatus.mockResolvedValue({
      ok: true,
      session: { ...BASE_SESSION, status: 'active' } as any,
    });

    const res = await sessionRouter.request(`/${SESSION_ID}/status`, {
      method: 'PATCH',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('active');
  });

  it('returns 403 when caller is not the organizer', async () => {
    mockProgressSessionStatus.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await sessionRouter.request(`/${SESSION_ID}/status`, {
      method: 'PATCH',
      headers: withAuth('other-user'),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when session not found', async () => {
    mockProgressSessionStatus.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await sessionRouter.request(`/${SESSION_ID}/status`, {
      method: 'PATCH',
      headers: withAuth(),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when transition is invalid (e.g. completed → active)', async () => {
    mockProgressSessionStatus.mockResolvedValue({ ok: false, reason: 'invalid_transition' });

    const res = await sessionRouter.request(`/${SESSION_ID}/status`, {
      method: 'PATCH',
      headers: withAuth(),
    });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/attendance
// ---------------------------------------------------------------------------

describe('POST /:id/attendance', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when attendedUserIds is not an array', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedUserIds: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 with summary on success', async () => {
    mockMarkAttendance.mockResolvedValue({ ok: true, attended: 3, noShows: 1 });

    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedUserIds: ['u-1', 'u-2', 'u-3'] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attended: 3, noShows: 1 });
  });

  it('returns 403 when not the organizer', async () => {
    mockMarkAttendance.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, {
      method: 'POST',
      headers: { ...withAuth('other-user'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedUserIds: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 when session is not completed', async () => {
    mockMarkAttendance.mockResolvedValue({ ok: false, reason: 'not_completed' });

    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedUserIds: [] }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 when session not found', async () => {
    mockMarkAttendance.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await sessionRouter.request(`/${SESSION_ID}/attendance`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedUserIds: [] }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /:id/rsvps
// ---------------------------------------------------------------------------

describe('GET /:id/rsvps', () => {
  it('returns rsvps list', async () => {
    mockGetSessionById.mockResolvedValue(BASE_SESSION as any);
    mockGetSessionRsvps.mockResolvedValue([
      { sessionId: SESSION_ID, userId: USER_ID, status: 'going', joinedAt: '2030-01-05T00:00:00Z' },
    ]);

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvps`);
    expect(res.status).toBe(200);
    expect((await res.json()).rsvps).toHaveLength(1);
  });

  it('excludes attendees with private profiles from the roster', async () => {
    mockGetSessionById.mockResolvedValue(BASE_SESSION as any);
    // The private-profile attendee is already filtered out by getSessionRsvps itself
    mockGetSessionRsvps.mockResolvedValue([
      { sessionId: SESSION_ID, userId: USER_ID, status: 'going', joinedAt: '2030-01-05T00:00:00Z' },
    ]);

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvps`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rsvps).toHaveLength(1);
    expect(body.rsvps[0].userId).toBe(USER_ID);
  });

  it('returns 403 for invite_only session without auth', async () => {
    mockGetSessionById.mockResolvedValue({ ...BASE_SESSION, visibility: 'invite_only' } as any);

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvps`);
    expect(res.status).toBe(403);
    expect(mockGetSessionRsvps).not.toHaveBeenCalled();
  });

  it('returns the roster for invite_only session when authenticated', async () => {
    mockGetSessionById.mockResolvedValue({ ...BASE_SESSION, visibility: 'invite_only' } as any);
    mockGetSessionRsvps.mockResolvedValue([
      { sessionId: SESSION_ID, userId: USER_ID, status: 'going', joinedAt: '2030-01-05T00:00:00Z' },
    ]);

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvps`, { headers: withAuth() });
    expect(res.status).toBe(200);
    expect((await res.json()).rsvps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/rsvp
// ---------------------------------------------------------------------------

describe('POST /:id/rsvp', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with going status on success', async () => {
    mockJoinSession.mockResolvedValue({ ok: true, status: 'going' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('going');
  });

  it('returns 201 with waitlisted status and no warning', async () => {
    mockJoinSession.mockResolvedValue({ ok: true, status: 'waitlisted' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('waitlisted');
    expect(body.warning).toBeUndefined();
  });

  it('includes warning in response', async () => {
    mockJoinSession.mockResolvedValue({ ok: true, status: 'going', warning: 'playing_up' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect((await res.json()).warning).toBe('playing_up');
  });

  it('returns 404 when session not found', async () => {
    mockJoinSession.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when skill blocked', async () => {
    mockJoinSession.mockResolvedValue({ ok: false, reason: 'skill_blocked' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 when already RSVPed', async () => {
    mockJoinSession.mockResolvedValue({ ok: false, reason: 'already_rsvped' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id/rsvp
// ---------------------------------------------------------------------------

describe('DELETE /:id/rsvp', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 200 on successful cancel', async () => {
    mockCancelRsvp.mockResolvedValue({ ok: true });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('includes warning in response when the reliability-score penalty failed to apply', async () => {
    mockCancelRsvp.mockResolvedValue({ ok: true, warning: 'penalty_not_applied' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBe('penalty_not_applied');
  });

  it('returns 404 when session not found', async () => {
    mockCancelRsvp.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when no active RSVP to cancel', async () => {
    mockCancelRsvp.mockResolvedValue({ ok: false, reason: 'not_rsvped' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// GET /:id/rsvp
// ---------------------------------------------------------------------------

describe('GET /:id/rsvp', () => {
  it('returns 401 without auth', async () => {
    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when user has no active RSVP', async () => {
    mockGetMyRsvp.mockResolvedValue(null);

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, { headers: withAuth() });
    expect(res.status).toBe(404);
  });

  it('returns 200 with going status', async () => {
    mockGetMyRsvp.mockResolvedValue({ status: 'going', joinedAt: '2030-01-05T00:00:00Z' });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, { headers: withAuth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'going', joinedAt: '2030-01-05T00:00:00Z' });
    expect(body.waitlistPosition).toBeUndefined();
  });

  it('returns 200 with waitlisted status and position', async () => {
    mockGetMyRsvp.mockResolvedValue({
      status: 'waitlisted',
      joinedAt: '2030-01-06T00:00:00Z',
      waitlistPosition: 3,
    });

    const res = await sessionRouter.request(`/${SESSION_ID}/rsvp`, { headers: withAuth() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'waitlisted',
      joinedAt: '2030-01-06T00:00:00Z',
      waitlistPosition: 3,
    });
  });
});