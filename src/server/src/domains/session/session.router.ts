import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import type { SessionStatus, SessionType, SessionFormat, SessionVisibility, ShuttlePolicy } from '@pavilion/types';
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
  type JoinResult,
  type ProgressStatusResult,
} from './session.service.js';

export const sessionRouter = new Hono<{ Variables: { userId: string } }>();

const VALID_STATUSES: SessionStatus[] = ['upcoming', 'active', 'completed', 'cancelled'];
const VALID_TYPES: SessionType[] = ['drop_in', 'organizer_hosted'];
const VALID_FORMATS: SessionFormat[] = ['casual_rotation', 'king_of_the_court', 'round_robin'];
const VALID_VISIBILITIES: SessionVisibility[] = ['public', 'invite_only'];
const VALID_SHUTTLE_POLICIES: ShuttlePolicy[] = ['bring_your_own', 'split_cost', 'provided'];

const JOIN_REASON_STATUS: Record<
  Extract<JoinResult, { ok: false }>['reason'],
  400 | 403 | 404 | 409
> = {
  not_found: 404,
  not_open: 409,
  already_rsvped: 409,
  skill_blocked: 403,
};

const PROGRESS_REASON_STATUS: Record<
  Extract<ProgressStatusResult, { ok: false }>['reason'],
  403 | 404 | 409
> = {
  not_found: 404,
  forbidden: 403,
  invalid_transition: 409,
};

// ---------------------------------------------------------------------------
// GET / — list sessions
// ---------------------------------------------------------------------------

sessionRouter.get('/', async (c) => {
  const {
    status, venue_id, organizer_id, attendee_id,
    date_from, date_to, city, region, skill_min, skill_max,
  } = c.req.query();

  if (status !== undefined && !VALID_STATUSES.includes(status as SessionStatus)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  let skillMinNum: number | undefined;
  let skillMaxNum: number | undefined;
  if (skill_min !== undefined) {
    skillMinNum = Number(skill_min);
    if (isNaN(skillMinNum)) return c.json({ error: 'Invalid skill_min' }, 400);
  }
  if (skill_max !== undefined) {
    skillMaxNum = Number(skill_max);
    if (isNaN(skillMaxNum)) return c.json({ error: 'Invalid skill_max' }, 400);
  }

  const filters: Parameters<typeof listSessions>[0] = {};
  if (status !== undefined) filters.status = status as SessionStatus;
  if (venue_id !== undefined) filters.venueId = venue_id;
  if (organizer_id !== undefined) filters.organizerId = organizer_id;
  if (date_from !== undefined) filters.dateFrom = date_from;
  if (date_to !== undefined) filters.dateTo = date_to;
  if (city !== undefined) filters.city = city;
  if (region !== undefined) filters.region = region;
  if (skillMinNum !== undefined) filters.skillMin = skillMinNum;
  if (skillMaxNum !== undefined) filters.skillMax = skillMaxNum;

  if (attendee_id !== undefined) filters.attendeeId = attendee_id;

  // Resolve optional caller identity for privacy enforcement:
  // attendee_id — respects private-profile visibility
  // organizer_id — gates invite_only sessions to the organizer themselves
  if (attendee_id !== undefined || organizer_id !== undefined) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) filters.requestingUserId = user.id;
    }
  }

  const sessions = await listSessions(filters);
  return c.json({ sessions });
});

// ---------------------------------------------------------------------------
// POST / — create session
// ---------------------------------------------------------------------------

sessionRouter.post('/', auth, async (c) => {
  const body = await c.req.json();
  const {
    venueId,
    venueName,
    type,
    format,
    visibility,
    skillMin,
    skillMax,
    strictRange,
    courtCount,
    maxPlayers,
    startsAt,
    durationMinutes,
    shuttlePolicy,
    shuttleTubePrice,
    notes,
    isRecurring,
    recurringCronExpr,
  } = body as Record<string, unknown>;

  if (
    !venueName || !type || !format || !visibility ||
    skillMin === undefined || skillMax === undefined ||
    !courtCount || !maxPlayers || !startsAt || !durationMinutes || !shuttlePolicy
  ) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (!VALID_TYPES.includes(type as SessionType)) return c.json({ error: 'Invalid type' }, 400);
  if (!VALID_FORMATS.includes(format as SessionFormat)) return c.json({ error: 'Invalid format' }, 400);
  if (!VALID_VISIBILITIES.includes(visibility as SessionVisibility)) return c.json({ error: 'Invalid visibility' }, 400);
  if (!VALID_SHUTTLE_POLICIES.includes(shuttlePolicy as ShuttlePolicy)) return c.json({ error: 'Invalid shuttlePolicy' }, 400);

  const skillMinNum = Number(skillMin);
  const skillMaxNum = Number(skillMax);
  if (isNaN(skillMinNum) || isNaN(skillMaxNum)) {
    return c.json({ error: 'skillMin and skillMax must be numbers' }, 400);
  }
  if (skillMinNum >= skillMaxNum) return c.json({ error: 'skillMin must be less than skillMax' }, 400);
  if ((maxPlayers as number) < 1) return c.json({ error: 'maxPlayers must be at least 1' }, 400);

  const result = await createSession(c.get('userId'), {
    venueId: venueId as string | null | undefined,
    venueName: venueName as string,
    type: type as SessionType,
    format: format as SessionFormat,
    visibility: visibility as SessionVisibility,
    skillMin: skillMinNum,
    skillMax: skillMaxNum,
    strictRange: strictRange as boolean | undefined,
    courtCount: courtCount as number,
    maxPlayers: maxPlayers as number,
    startsAt: startsAt as string,
    durationMinutes: durationMinutes as number,
    shuttlePolicy: shuttlePolicy as ShuttlePolicy,
    shuttleTubePrice: shuttleTubePrice as number | null | undefined,
    notes: notes as string | null | undefined,
    isRecurring: isRecurring as boolean | undefined,
    recurringCronExpr: recurringCronExpr as string | null | undefined,
  });

  if (!result) return c.json({ error: 'Failed to create session' }, 500);

  return c.json(
    { session: result.session, ...(result.warning ? { warning: result.warning } : {}) },
    201,
  );
});

// ---------------------------------------------------------------------------
// GET /:id — get session
// ---------------------------------------------------------------------------

sessionRouter.get('/:id', async (c) => {
  const session = await getSessionById(c.req.param('id'));
  if (!session) return c.json({ error: 'Not found' }, 404);

  if (session.visibility === 'invite_only') {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'Forbidden' }, 403);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json(session);
});

// ---------------------------------------------------------------------------
// PATCH /:id — update session (organizer only)
// ---------------------------------------------------------------------------

sessionRouter.patch('/:id', auth, async (c) => {
  const body = await c.req.json();
  const session = await updateSession(c.req.param('id'), c.get('userId'), body);
  if (!session) return c.json({ error: 'Not found or forbidden' }, 404);
  return c.json(session);
});

// ---------------------------------------------------------------------------
// DELETE /:id — cancel session (organizer only)
// ---------------------------------------------------------------------------

sessionRouter.delete('/:id', auth, async (c) => {
  const ok = await cancelSession(c.req.param('id'), c.get('userId'));
  if (!ok) return c.json({ error: 'Not found, forbidden, or already cancelled' }, 404);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// PATCH /:id/status — advance session status (organizer only)
// ---------------------------------------------------------------------------

sessionRouter.patch('/:id/status', auth, async (c) => {
  const result = await progressSessionStatus(c.req.param('id'), c.get('userId'));
  if (!result.ok) {
    return c.json({ error: result.reason }, PROGRESS_REASON_STATUS[result.reason]);
  }
  return c.json(result.session);
});

// ---------------------------------------------------------------------------
// POST /:id/attendance — mark who attended (organizer only, session must be completed)
// ---------------------------------------------------------------------------

sessionRouter.post('/:id/attendance', auth, async (c) => {
  const body = await c.req.json();
  const { attendedUserIds } = body as { attendedUserIds?: unknown };

  if (!Array.isArray(attendedUserIds) || !attendedUserIds.every((x) => typeof x === 'string')) {
    return c.json({ error: 'attendedUserIds must be an array of strings' }, 400);
  }

  const result = await markAttendance(c.req.param('id'), c.get('userId'), attendedUserIds);
  if (!result.ok) {
    const code = result.reason === 'not_found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
    return c.json({ error: result.reason }, code);
  }
  return c.json({ attended: result.attended, noShows: result.noShows });
});

// ---------------------------------------------------------------------------
// GET /:id/rsvps — list RSVPs for a session
// ---------------------------------------------------------------------------

sessionRouter.get('/:id/rsvps', async (c) => {
  const session = await getSessionById(c.req.param('id'));
  if (!session) return c.json({ error: 'Not found' }, 404);

  if (session.visibility === 'invite_only') {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'Forbidden' }, 403);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return c.json({ error: 'Forbidden' }, 403);
  }

  const rsvps = await getSessionRsvps(c.req.param('id'));
  return c.json({ rsvps });
});

// ---------------------------------------------------------------------------
// GET /:id/rsvp — own RSVP status + waitlist position
// ---------------------------------------------------------------------------

sessionRouter.get('/:id/rsvp', auth, async (c) => {
  const result = await getMyRsvp(c.get('userId'), c.req.param('id'));
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /:id/rsvp — join a session
// ---------------------------------------------------------------------------

sessionRouter.post('/:id/rsvp', auth, async (c) => {
  const result = await joinSession(c.get('userId'), c.req.param('id'));
  if (!result.ok) {
    return c.json({ error: result.reason }, JOIN_REASON_STATUS[result.reason]);
  }
  return c.json(
    { status: result.status, ...(result.warning ? { warning: result.warning } : {}) },
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /:id/rsvp — cancel RSVP
// ---------------------------------------------------------------------------

sessionRouter.delete('/:id/rsvp', auth, async (c) => {
  const result = await cancelRsvp(c.get('userId'), c.req.param('id'));
  if (!result.ok) {
    return c.json({ error: result.reason }, result.reason === 'not_found' ? 404 : 409);
  }
  return c.json({ success: true, ...(result.warning ? { warning: result.warning } : {}) });
});