import { Hono } from 'hono';
import { auth, getOptionalUserId } from '../../middleware/auth.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { SessionStatus, SessionType, SessionFormat, SessionVisibility, ShuttlePolicy } from '@pavilion/types';
import {
  getSessionById,
  listSessions,
  getSessionRsvps,
  getSessionOrganizerName,
  getMyRsvp,
  createSession,
  updateSession,
  cancelSession,
  progressSessionStatus,
  markAttendance,
  joinSession,
  cancelRsvp,
  removeRsvp,
  type JoinResult,
  type ProgressStatusResult,
  type UpdateSessionResult,
  type RemoveRsvpResult,
} from './session.service.js';

export const sessionRouter = new Hono<{ Variables: { userId: string } }>();

const VALID_STATUSES: SessionStatus[] = ['upcoming', 'active', 'voting', 'completed', 'cancelled'];
const VALID_TYPES: SessionType[] = ['drop_in', 'organizer_hosted'];
const VALID_FORMATS: SessionFormat[] = ['casual_rotation', 'king_of_the_court', 'round_robin'];
const VALID_VISIBILITIES: SessionVisibility[] = ['public', 'invite_only'];
const VALID_SHUTTLE_POLICIES: ShuttlePolicy[] = ['bring_your_own', 'split_cost', 'provided'];

// sessions.skill_min/skill_max are numeric(4,2) (database-schema.md) — a
// value whose integer part has more than 2 digits (>= 100 or <= -100)
// overflows Postgres's numeric type and previously surfaced as an unhandled
// 500 instead of a clean 400 (see technical-notes.md's KI-007). MIN_SKILL
// matches rating.algorithm.ts's MIN_SCORE — no player is ever rated below it.
const MIN_SKILL = 1;
const MAX_SKILL = 99.99;
// sessions.shuttle_tube_price is numeric(6,2) — same overflow risk.
const MAX_SHUTTLE_TUBE_PRICE = 9999.99;

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

const UPDATE_REASON_STATUS: Record<Extract<UpdateSessionResult, { ok: false }>['reason'], 400 | 404> = {
  not_found: 404,
  invalid_skill_range: 400,
};

const REMOVE_RSVP_REASON_STATUS: Record<Extract<RemoveRsvpResult, { ok: false }>['reason'], 403 | 404 | 409> = {
  not_found: 404,
  forbidden: 403,
  not_upcoming: 409,
  not_rsvped: 409,
};

// Validates whichever of these fields are present — every field is optional
// here since PATCH sends a partial body. Shared by POST / and PATCH /:id so
// both paths get the same protection, rather than POST alone having checks
// and PATCH having none (the gap that let a skill value like 123 reach the
// DB and crash with a numeric overflow — see KI-007).
function validateSessionFieldValues(fields: {
  venueName?: unknown;
  type?: unknown;
  format?: unknown;
  visibility?: unknown;
  shuttlePolicy?: unknown;
  skillMin?: unknown;
  skillMax?: unknown;
  courtCount?: unknown;
  maxPlayers?: unknown;
  startsAt?: unknown;
  durationMinutes?: unknown;
  shuttleTubePrice?: unknown;
  notes?: unknown;
  strictRange?: unknown;
}): string | null {
  if (fields.venueName !== undefined && (typeof fields.venueName !== 'string' || fields.venueName.trim() === '')) {
    return 'venueName must be a non-empty string';
  }
  if (fields.type !== undefined && !VALID_TYPES.includes(fields.type as SessionType)) {
    return 'Invalid type';
  }
  if (fields.format !== undefined && !VALID_FORMATS.includes(fields.format as SessionFormat)) {
    return 'Invalid format';
  }
  if (fields.visibility !== undefined && !VALID_VISIBILITIES.includes(fields.visibility as SessionVisibility)) {
    return 'Invalid visibility';
  }
  if (fields.shuttlePolicy !== undefined && !VALID_SHUTTLE_POLICIES.includes(fields.shuttlePolicy as ShuttlePolicy)) {
    return 'Invalid shuttlePolicy';
  }

  let skillMinNum: number | undefined;
  let skillMaxNum: number | undefined;
  if (fields.skillMin !== undefined) {
    skillMinNum = Number(fields.skillMin);
    if (isNaN(skillMinNum)) return 'skillMin must be a number';
    if (skillMinNum < MIN_SKILL || skillMinNum > MAX_SKILL) {
      return `skillMin must be between ${MIN_SKILL} and ${MAX_SKILL}`;
    }
  }
  if (fields.skillMax !== undefined) {
    skillMaxNum = Number(fields.skillMax);
    if (isNaN(skillMaxNum)) return 'skillMax must be a number';
    if (skillMaxNum < MIN_SKILL || skillMaxNum > MAX_SKILL) {
      return `skillMax must be between ${MIN_SKILL} and ${MAX_SKILL}`;
    }
  }
  if (skillMinNum !== undefined && skillMaxNum !== undefined && skillMinNum >= skillMaxNum) {
    return 'skillMin must be less than skillMax';
  }

  if (fields.courtCount !== undefined && (!Number.isFinite(Number(fields.courtCount)) || Number(fields.courtCount) < 1)) {
    return 'courtCount must be at least 1';
  }
  if (fields.maxPlayers !== undefined && (!Number.isFinite(Number(fields.maxPlayers)) || Number(fields.maxPlayers) < 1)) {
    return 'maxPlayers must be at least 1';
  }
  if (
    fields.durationMinutes !== undefined &&
    (!Number.isFinite(Number(fields.durationMinutes)) || Number(fields.durationMinutes) < 1)
  ) {
    return 'durationMinutes must be at least 1';
  }
  if (fields.shuttleTubePrice !== undefined && fields.shuttleTubePrice !== null) {
    const n = Number(fields.shuttleTubePrice);
    if (isNaN(n) || n < 0 || n > MAX_SHUTTLE_TUBE_PRICE) {
      return `shuttleTubePrice must be between 0 and ${MAX_SHUTTLE_TUBE_PRICE}`;
    }
  }
  if (fields.notes !== undefined && fields.notes !== null && typeof fields.notes !== 'string') {
    return 'notes must be a string or null';
  }
  if (fields.strictRange !== undefined && typeof fields.strictRange !== 'boolean') {
    return 'strictRange must be a boolean';
  }
  if (
    fields.startsAt !== undefined &&
    (typeof fields.startsAt !== 'string' || isNaN(Date.parse(fields.startsAt)))
  ) {
    return 'startsAt must be a valid date string';
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET / — list sessions
// ---------------------------------------------------------------------------

sessionRouter.get('/', async (c) => {
  const {
    status, id, name, venue_id, organizer_id, attendee_id,
    date_from, date_to, city, region, skill_min, skill_max, admin,
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
  if (id !== undefined) filters.id = id;
  if (name !== undefined) filters.name = name;
  if (venue_id !== undefined) filters.venueId = venue_id;
  if (organizer_id !== undefined) filters.organizerId = organizer_id;
  if (date_from !== undefined) filters.dateFrom = date_from;
  if (date_to !== undefined) filters.dateTo = date_to;
  if (city !== undefined) filters.city = city;
  if (region !== undefined) filters.region = region;
  if (skillMinNum !== undefined) filters.skillMin = skillMinNum;
  if (skillMaxNum !== undefined) filters.skillMax = skillMaxNum;

  if (attendee_id !== undefined) filters.attendeeId = attendee_id;

  // admin=true — moderator+ search, bypasses every visibility rule below.
  // Role is only resolved when this flag is present, so an ordinary browse
  // request never pays for the extra admins-table lookup.
  if (admin === 'true') {
    const requestingUserId = await getOptionalUserId(c);
    if (!requestingUserId) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getAdminRole(requestingUserId);
    if (!roleAtLeast(role, 'moderator')) return c.json({ error: 'Forbidden' }, 403);
    filters.adminOverride = true;
  } else if (attendee_id !== undefined || organizer_id !== undefined || id !== undefined) {
    // Resolve optional caller identity for privacy enforcement:
    // attendee_id — respects private-profile visibility
    // organizer_id — gates invite_only sessions to the organizer themselves
    // id — gates an exact-id-matched invite_only session to authenticated callers
    const requestingUserId = await getOptionalUserId(c);
    if (requestingUserId) filters.requestingUserId = requestingUserId;
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

  const validationError = validateSessionFieldValues({
    venueName, type, format, visibility, shuttlePolicy, startsAt,
    skillMin, skillMax, courtCount, maxPlayers, durationMinutes, shuttleTubePrice, notes,
  });
  if (validationError) return c.json({ error: validationError }, 400);

  const skillMinNum = Number(skillMin);
  const skillMaxNum = Number(skillMax);

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

  const requestingUserId = await getOptionalUserId(c);

  if (session.visibility === 'invite_only' && !requestingUserId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const organizerName = await getSessionOrganizerName(session.id, session.organizerId, requestingUserId);
  return c.json({ ...session, organizerName });
});

// ---------------------------------------------------------------------------
// PATCH /:id — update session (organizer only)
// ---------------------------------------------------------------------------

sessionRouter.patch('/:id', auth, async (c) => {
  const body = await c.req.json();
  const {
    venueName, format, visibility, skillMin, skillMax, strictRange,
    courtCount, maxPlayers, startsAt, durationMinutes, shuttlePolicy, shuttleTubePrice, notes,
  } = body as Record<string, unknown>;

  const validationError = validateSessionFieldValues({
    venueName, format, visibility, shuttlePolicy, startsAt,
    skillMin, skillMax, courtCount, maxPlayers, durationMinutes, shuttleTubePrice, notes, strictRange,
  });
  if (validationError) return c.json({ error: validationError }, 400);

  const result = await updateSession(c.req.param('id'), c.get('userId'), body);
  if (!result.ok) {
    return c.json({ error: result.reason }, UPDATE_REASON_STATUS[result.reason]);
  }
  return c.json(result.session);
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

  // admin=true — moderator+ view, returns every RSVP status (including
  // cancelled/attended/no_show) and every display name regardless of
  // privacy_level, same admin-override convention as GET / `admin=true`.
  if (c.req.query('admin') === 'true') {
    const requestingUserId = await getOptionalUserId(c);
    if (!requestingUserId) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getAdminRole(requestingUserId);
    if (!roleAtLeast(role, 'moderator')) return c.json({ error: 'Forbidden' }, 403);
    const rsvps = await getSessionRsvps(session.id, requestingUserId, session.organizerId, true);
    return c.json({ rsvps });
  }

  const requestingUserId = await getOptionalUserId(c);

  if (session.visibility === 'invite_only' && !requestingUserId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rsvps = await getSessionRsvps(session.id, requestingUserId, session.organizerId);
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

// ---------------------------------------------------------------------------
// DELETE /:id/rsvps/:userId — moderator+ removes another player's RSVP
// (upcoming sessions only)
// ---------------------------------------------------------------------------

sessionRouter.delete('/:id/rsvps/:userId', auth, async (c) => {
  const result = await removeRsvp(c.req.param('id'), c.req.param('userId'), c.get('userId'));
  if (!result.ok) {
    return c.json({ error: result.reason }, REMOVE_RSVP_REASON_STATUS[result.reason]);
  }
  return c.json({ success: true });
});