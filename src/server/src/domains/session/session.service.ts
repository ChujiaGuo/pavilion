import { supabase } from '../../lib/supabase.js';
import type {
  Session,
  SessionRsvp,
  SessionType,
  SessionFormat,
  SessionVisibility,
  ShuttlePolicy,
  SessionStatus,
} from '@pavilion/types';

const LATE_CANCEL_PENALTY = 5;
const HOURS_12_MS = 12 * 60 * 60 * 1000;

const SESSION_SELECT =
  'id, organizer_id, venue_id, venue_name, type, format, visibility, skill_min, skill_max, strict_range, court_count, max_players, starts_at, duration_minutes, shuttle_policy, shuttle_tube_price, notes, status, is_recurring, recurring_cron_expr, parent_session_id, created_at';

type SessionRow = {
  id: string;
  organizer_id: string;
  venue_id: string | null;
  venue_name: string;
  type: string;
  format: string;
  visibility: string;
  skill_min: number;
  skill_max: number;
  strict_range: boolean;
  court_count: number;
  max_players: number;
  starts_at: string;
  duration_minutes: number;
  shuttle_policy: string;
  shuttle_tube_price: number | null;
  notes: string | null;
  status: string;
  is_recurring: boolean;
  recurring_cron_expr: string | null;
  parent_session_id: string | null;
  created_at: string;
};

type RsvpRow = {
  session_id: string;
  user_id: string;
  status: string;
  joined_at: string;
};

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    type: row.type as SessionType,
    format: row.format as SessionFormat,
    visibility: row.visibility as SessionVisibility,
    skillMin: Number(row.skill_min),
    skillMax: Number(row.skill_max),
    strictRange: row.strict_range,
    courtCount: row.court_count,
    maxPlayers: row.max_players,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    shuttlePolicy: row.shuttle_policy as ShuttlePolicy,
    shuttleTubePrice: row.shuttle_tube_price,
    notes: row.notes,
    status: row.status as SessionStatus,
    isRecurring: row.is_recurring,
    recurringCronExpr: row.recurring_cron_expr,
    parentSessionId: row.parent_session_id,
    createdAt: row.created_at,
  };
}

function toRsvp(row: RsvpRow, displayName: string | null = null): SessionRsvp {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status as SessionRsvp['status'],
    joinedAt: row.joined_at,
    displayName,
  };
}

export type SessionCreateFields = {
  venueId?: string | null;
  venueName: string;
  type: SessionType;
  format: SessionFormat;
  visibility: SessionVisibility;
  skillMin: number;
  skillMax: number;
  strictRange?: boolean;
  courtCount: number;
  maxPlayers: number;
  startsAt: string;
  durationMinutes: number;
  shuttlePolicy: ShuttlePolicy;
  shuttleTubePrice?: number | null;
  notes?: string | null;
  isRecurring?: boolean;
  recurringCronExpr?: string | null;
};

export type SessionUpdateFields = Partial<
  Pick<
    SessionCreateFields,
    | 'venueName'
    | 'format'
    | 'visibility'
    | 'skillMin'
    | 'skillMax'
    | 'strictRange'
    | 'courtCount'
    | 'maxPlayers'
    | 'startsAt'
    | 'durationMinutes'
    | 'shuttlePolicy'
    | 'shuttleTubePrice'
    | 'notes'
  >
>;

export type SessionListFilters = {
  status?: SessionStatus;
  id?: string;
  name?: string;
  venueId?: string;
  organizerId?: string;
  attendeeId?: string;
  requestingUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  region?: string;
  skillMin?: number;
  skillMax?: number;
};

export type JoinResult =
  | { ok: true; status: 'going' | 'waitlisted'; warning?: 'playing_up' | 'playing_down' }
  | { ok: false; reason: 'not_found' | 'not_open' | 'already_rsvped' | 'skill_blocked' };

export type CancelRsvpResult =
  | { ok: true; warning?: 'penalty_not_applied' }
  | { ok: false; reason: 'not_found' | 'not_rsvped' };

export type MyRsvpResult = {
  status: 'going' | 'waitlisted' | 'attended' | 'no_show';
  joinedAt: string;
  waitlistPosition?: number;
} | null;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getSessionById(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return toSession(data as SessionRow);
}

export async function listSessions(filters: SessionListFilters = {}): Promise<Session[]> {
  const status = filters.status ?? 'upcoming';

  // Exact-id search bypasses the public-only visibility filter below (the
  // caller already has the specific session — e.g. from a shared link) but
  // still requires authentication to see an invite_only session, same rule
  // GET /:id already applies. Ignores every other filter param.
  if (filters.id) {
    const { data, error } = await supabase
      .from('sessions')
      .select(SESSION_SELECT)
      .eq('id', filters.id)
      .eq('status', status)
      .maybeSingle();
    if (error || !data) return [];
    const session = toSession(data as SessionRow);
    if (session.visibility === 'invite_only' && !filters.requestingUserId) return [];
    return [session];
  }

  // attendeeId: enforce privacy then resolve session IDs from RSVPs the user was actually part of
  let attendeeSessionIds: string[] | null = null;
  if (filters.attendeeId) {
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('privacy_level')
      .eq('id', filters.attendeeId)
      .single();

    if (
      targetProfile?.privacy_level === 'private' &&
      filters.requestingUserId !== filters.attendeeId
    ) {
      return [];
    }

    // 'attended' is included alongside the active statuses so a session
    // survives in this filter after the organizer marks attendance
    // (POST /:id/attendance flips 'going' -> 'attended') — otherwise a
    // completed session the attendee actually attended would silently drop
    // out of their own history. 'no_show'/'cancelled' are deliberately
    // excluded: this filter answers "sessions this user was part of", not
    // "sessions this user RSVPed to at some point".
    const { data: rsvpData } = await supabase
      .from('session_rsvps')
      .select('session_id')
      .eq('user_id', filters.attendeeId)
      .in('status', ['going', 'waitlisted', 'attended']);
    attendeeSessionIds = (rsvpData ?? []).map((r: { session_id: string }) => r.session_id);
    if (attendeeSessionIds.length === 0) return [];
  }

  // city/region: resolve matching venue IDs first (sessions have no city column)
  let cityVenueIds: string[] | null = null;
  if (filters.city || filters.region) {
    let venueQuery = supabase.from('venues').select('id');
    if (filters.city) venueQuery = venueQuery.eq('city', filters.city);
    if (filters.region) venueQuery = venueQuery.eq('region', filters.region);
    const { data: venueData } = await venueQuery;
    cityVenueIds = (venueData ?? []).map((v: { id: string }) => v.id);
    if (cityVenueIds.length === 0) return [];
  }

  let query = supabase.from('sessions').select(SESSION_SELECT).eq('status', status);

  // invite_only sessions are only visible to the organizer themselves, or to
  // an attendee looking at their own Attending list. Any other caller —
  // including unauthenticated requests and requests filtered by a
  // third-party organizerId/attendeeId — only sees public sessions.
  if (filters.organizerId) {
    query = query.eq('organizer_id', filters.organizerId);
    if (filters.requestingUserId !== filters.organizerId) {
      query = query.eq('visibility', 'public');
    }
  } else if (filters.attendeeId && filters.requestingUserId === filters.attendeeId) {
    // Owner viewing their own Attending list — an invite_only session they're
    // validly attending should still show up there; only the public Browse
    // listing needs to hide it (brainstorm.md's invite-only model).
  } else {
    query = query.eq('visibility', 'public');
  }

  if (attendeeSessionIds) query = query.in('id', attendeeSessionIds);
  if (filters.venueId) query = query.eq('venue_id', filters.venueId);
  if (cityVenueIds) query = query.in('venue_id', cityVenueIds);
  if (filters.name) query = query.ilike('venue_name', `%${filters.name}%`);
  if (filters.dateFrom) query = query.gte('starts_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('starts_at', filters.dateTo);
  // skill overlap: session range must overlap with the requested range
  if (filters.skillMin !== undefined) query = query.gte('skill_max', filters.skillMin);
  if (filters.skillMax !== undefined) query = query.lte('skill_min', filters.skillMax);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as SessionRow[]).map(toSession);
}

export async function getSessionRsvps(
  sessionId: string,
  requestingUserId?: string,
  organizerId?: string,
): Promise<SessionRsvp[]> {
  const { data, error } = await supabase
    .from('session_rsvps')
    .select('session_id, user_id, status, joined_at')
    .eq('session_id', sessionId)
    .in('status', ['going', 'waitlisted'])
    .order('joined_at', { ascending: true });

  if (error || !data) return [];
  const rows = data as RsvpRow[];
  if (rows.length === 0) return [];

  const userIds = rows.map((row) => row.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, privacy_level')
    .in('id', userIds);

  const profileById = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string; privacy_level: string }) => [p.id, p]),
  );

  // A caller who shares this session — the organizer, or another active
  // participant — can see every co-attendee's display name regardless of
  // privacy_level (brainstorm.md's Privacy section: "only a player's
  // name/display name is visible to anyone who's shared a session with
  // them"). Anyone else (including anonymous browsers of a public session)
  // still only sees attendees with a public profile.
  const isParticipant =
    requestingUserId != null &&
    (requestingUserId === organizerId || rows.some((row) => row.user_id === requestingUserId));

  return rows
    .filter((row) => isParticipant || profileById.get(row.user_id)?.privacy_level !== 'private')
    .map((row) => toRsvp(row, profileById.get(row.user_id)?.display_name ?? null));
}

export async function getSessionOrganizerName(
  sessionId: string,
  organizerId: string,
  requestingUserId?: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, privacy_level')
    .eq('id', organizerId)
    .single();

  if (!profile) return null;
  if (profile.privacy_level !== 'private' || requestingUserId === organizerId) {
    return profile.display_name;
  }

  // Private organizer — only reveal the name to someone who shares this
  // session with them (an active co-attendee), same carve-out as
  // getSessionRsvps above. Anyone else gets null and the client falls back
  // to a generic label.
  if (!requestingUserId) return null;
  const { data: rsvp } = await supabase
    .from('session_rsvps')
    .select('status')
    .eq('session_id', sessionId)
    .eq('user_id', requestingUserId)
    .in('status', ['going', 'waitlisted', 'attended'])
    .maybeSingle();

  return rsvp ? profile.display_name : null;
}

export async function getMyRsvp(userId: string, sessionId: string): Promise<MyRsvpResult> {
  const { data: rsvp } = await supabase
    .from('session_rsvps')
    .select('status, joined_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!rsvp || rsvp.status === 'cancelled') return null;
  if (rsvp.status === 'going') return { status: 'going', joinedAt: rsvp.joined_at };
  if (rsvp.status === 'attended') return { status: 'attended', joinedAt: rsvp.joined_at };
  if (rsvp.status === 'no_show') return { status: 'no_show', joinedAt: rsvp.joined_at };
  if (rsvp.status !== 'waitlisted') return null;

  // Waitlisted — compute position (1-indexed) by counting earlier entries
  const { count } = await supabase
    .from('session_rsvps')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'waitlisted')
    .lt('joined_at', rsvp.joined_at);

  return { status: 'waitlisted', joinedAt: rsvp.joined_at, waitlistPosition: (count ?? 0) + 1 };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createSession(
  userId: string,
  fields: SessionCreateFields,
): Promise<{ session: Session; warning?: 'skill_range_wide' } | null> {
  let warning: 'skill_range_wide' | undefined;

  const { data: profile } = await supabase
    .from('profiles')
    .select('internal_score')
    .eq('id', userId)
    .single();

  if (profile) {
    const grade = Math.floor(Number(profile.internal_score));
    const nearMin = Math.abs(grade - fields.skillMin) <= 1.5;
    const nearMax = Math.abs(grade - fields.skillMax) <= 1.5;
    if (!nearMin && !nearMax) warning = 'skill_range_wide';
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      organizer_id: userId,
      venue_id: fields.venueId ?? null,
      venue_name: fields.venueName,
      type: fields.type,
      format: fields.format,
      visibility: fields.visibility,
      skill_min: fields.skillMin,
      skill_max: fields.skillMax,
      strict_range: fields.strictRange ?? false,
      court_count: fields.courtCount,
      max_players: fields.maxPlayers,
      starts_at: fields.startsAt,
      duration_minutes: fields.durationMinutes,
      shuttle_policy: fields.shuttlePolicy,
      shuttle_tube_price: fields.shuttleTubePrice ?? null,
      notes: fields.notes ?? null,
      is_recurring: fields.isRecurring ?? false,
      recurring_cron_expr: fields.recurringCronExpr ?? null,
    })
    .select(SESSION_SELECT)
    .single();

  if (error || !data) return null;
  return { session: toSession(data as SessionRow), ...(warning ? { warning } : {}) };
}

export type UpdateSessionResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_found' | 'invalid_skill_range' };

export async function updateSession(
  id: string,
  userId: string,
  fields: SessionUpdateFields,
): Promise<UpdateSessionResult> {
  const updates: Record<string, unknown> = {};
  if (fields.venueName !== undefined) updates.venue_name = fields.venueName;
  if (fields.format !== undefined) updates.format = fields.format;
  if (fields.visibility !== undefined) updates.visibility = fields.visibility;
  if (fields.skillMin !== undefined) updates.skill_min = fields.skillMin;
  if (fields.skillMax !== undefined) updates.skill_max = fields.skillMax;
  if (fields.strictRange !== undefined) updates.strict_range = fields.strictRange;
  if (fields.courtCount !== undefined) updates.court_count = fields.courtCount;
  if (fields.maxPlayers !== undefined) updates.max_players = fields.maxPlayers;
  if (fields.startsAt !== undefined) updates.starts_at = fields.startsAt;
  if (fields.durationMinutes !== undefined) updates.duration_minutes = fields.durationMinutes;
  if (fields.shuttlePolicy !== undefined) updates.shuttle_policy = fields.shuttlePolicy;
  if (fields.shuttleTubePrice !== undefined) updates.shuttle_tube_price = fields.shuttleTubePrice;
  if (fields.notes !== undefined) updates.notes = fields.notes;

  // The skill_min < skill_max invariant can't be checked from the patch body
  // alone when only one side is being updated (e.g. just skillMin) — fetch
  // the current pair first so a partial update can't silently invert the
  // range. This read also re-confirms organizer_id ownership early, though
  // the final UPDATE's .eq() below is still the authoritative check.
  if (fields.skillMin !== undefined || fields.skillMax !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('sessions')
      .select('skill_min, skill_max')
      .eq('id', id)
      .eq('organizer_id', userId)
      .single();
    if (fetchError || !current) return { ok: false, reason: 'not_found' };

    const effectiveMin = fields.skillMin ?? Number(current.skill_min);
    const effectiveMax = fields.skillMax ?? Number(current.skill_max);
    if (effectiveMin >= effectiveMax) return { ok: false, reason: 'invalid_skill_range' };
  }

  // Organizer check is folded into the UPDATE — 0-row result means not found or not organizer
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .eq('organizer_id', userId)
    .select(SESSION_SELECT)
    .single();

  if (error) {
    // 23514 = check_violation — sessions_skill_range_valid catches what the
    // pre-update read above can miss: two concurrent single-side patches can
    // each pass validation against a stale read and still invert the range
    // once both commit. The DB constraint is the actual atomic guard; the
    // read above is just a fast-path that avoids the round trip in the
    // common (non-racing) case.
    if (error.code === '23514') return { ok: false, reason: 'invalid_skill_range' };
    return { ok: false, reason: 'not_found' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  return { ok: true, session: toSession(data as SessionRow) };
}

export async function cancelSession(id: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('organizer_id', userId)
    .eq('status', 'upcoming')
    .select('id');

  // A zero-row update returns no error — explicitly check that a row was matched.
  return !error && Array.isArray(data) && data.length > 0;
}

export type ProgressStatusResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'invalid_transition' };

const VALID_TRANSITIONS: Partial<Record<SessionStatus, SessionStatus>> = {
  upcoming: 'active',
  active: 'completed',
};

export async function progressSessionStatus(
  id: string,
  userId: string,
): Promise<ProgressStatusResult> {
  const { data: existing, error: fetchError } = await supabase
    .from('sessions')
    .select('status, organizer_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) return { ok: false, reason: 'not_found' };
  if (existing.organizer_id !== userId) return { ok: false, reason: 'forbidden' };

  const nextStatus = VALID_TRANSITIONS[existing.status as SessionStatus];
  if (!nextStatus) return { ok: false, reason: 'invalid_transition' };

  const { data, error } = await supabase
    .from('sessions')
    .update({ status: nextStatus })
    .eq('id', id)
    .eq('status', existing.status) // atomic guard: rejected if a concurrent cancel already ran
    .select(SESSION_SELECT)
    .single();

  if (error || !data) return { ok: false, reason: 'not_found' };
  return { ok: true, session: toSession(data as SessionRow) };
}

const NO_SHOW_PENALTY = 10;

export type MarkAttendanceResult =
  | { ok: true; attended: number; noShows: number }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'not_completed' | 'write_failed' };

export async function markAttendance(
  sessionId: string,
  organizerId: string,
  attendedUserIds: string[],
): Promise<MarkAttendanceResult> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('status, organizer_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) return { ok: false, reason: 'not_found' };
  if (session.organizer_id !== organizerId) return { ok: false, reason: 'forbidden' };
  if (session.status !== 'completed') return { ok: false, reason: 'not_completed' };

  // Only process RSVPs still in 'going' state — re-calls are safely ignored
  const { data: goingRsvps } = await supabase
    .from('session_rsvps')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('status', 'going');

  const goingIds = new Set((goingRsvps ?? []).map((r: { user_id: string }) => r.user_id));
  const attendedSet = new Set(attendedUserIds);
  const noShowIds = [...goingIds].filter((id) => !attendedSet.has(id));
  const confirmedIds = [...goingIds].filter((id) => attendedSet.has(id));

  // .eq('status', 'going') + .select() guards against a concurrent/duplicate call:
  // only rows this call's write actually flips are returned, so a second call racing
  // on the same stale 'going' read affects zero rows and skips the RPC penalty below.
  let actualConfirmedIds: string[] = [];
  if (confirmedIds.length > 0) {
    const { data: attendedRows, error: attendedError } = await supabase
      .from('session_rsvps')
      .update({ status: 'attended' })
      .eq('session_id', sessionId)
      .eq('status', 'going')
      .in('user_id', confirmedIds)
      .select('user_id');
    if (attendedError) return { ok: false, reason: 'write_failed' };
    actualConfirmedIds = (attendedRows ?? []).map((r: { user_id: string }) => r.user_id);
  }

  let actualNoShowIds: string[] = [];
  if (noShowIds.length > 0) {
    const { data: noShowRows, error: noShowError } = await supabase
      .from('session_rsvps')
      .update({ status: 'no_show' })
      .eq('session_id', sessionId)
      .eq('status', 'going')
      .in('user_id', noShowIds)
      .select('user_id');
    if (noShowError) return { ok: false, reason: 'write_failed' };
    actualNoShowIds = (noShowRows ?? []).map((r: { user_id: string }) => r.user_id);

    if (actualNoShowIds.length > 0) {
      const { error: decrementError } = await supabase.rpc('decrement_reliability_score', {
        uids: actualNoShowIds,
        points: NO_SHOW_PENALTY,
      });
      if (decrementError) return { ok: false, reason: 'write_failed' };
    }
  }

  return { ok: true, attended: actualConfirmedIds.length, noShows: actualNoShowIds.length };
}

// ---------------------------------------------------------------------------
// RSVP
// ---------------------------------------------------------------------------

export async function joinSession(userId: string, sessionId: string): Promise<JoinResult> {
  const { data: sessionData, error: sessionError } = await supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .single();

  if (sessionError || !sessionData) return { ok: false, reason: 'not_found' };
  const session = toSession(sessionData as SessionRow);

  if (session.status !== 'upcoming') return { ok: false, reason: 'not_open' };

  const { data: existingRsvp } = await supabase
    .from('session_rsvps')
    .select('status')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRsvp && (existingRsvp.status === 'going' || existingRsvp.status === 'waitlisted')) {
    return { ok: false, reason: 'already_rsvped' };
  }

  // Skill range check — skip for organizer joining their own session
  let warning: 'playing_up' | 'playing_down' | undefined;
  if (userId !== session.organizerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('internal_score')
      .eq('id', userId)
      .single();

    if (profile) {
      const playerScore = Number(profile.internal_score);
      const playingUp = session.skillMin - playerScore;
      const playingDown = playerScore - session.skillMax;

      if (playingUp > 1.5) return { ok: false, reason: 'skill_blocked' };
      if (playingDown > 3.0) return { ok: false, reason: 'skill_blocked' };
      if (playingUp > 0) warning = 'playing_up';
      else if (playingDown > 0) warning = 'playing_down';
    }
  }

  const { data: rsvpStatus, error: joinError } = await supabase.rpc('join_session_atomic', {
    p_session_id: sessionId,
    p_user_id: userId,
  });

  if (joinError || !rsvpStatus) return { ok: false, reason: 'not_found' };
  return { ok: true, status: rsvpStatus as 'going' | 'waitlisted', ...(warning ? { warning } : {}) };
}

export async function cancelRsvp(userId: string, sessionId: string): Promise<CancelRsvpResult> {
  const { data: sessionData, error: sessionError } = await supabase
    .from('sessions')
    .select('starts_at, status')
    .eq('id', sessionId)
    .single();

  if (sessionError || !sessionData) return { ok: false, reason: 'not_found' };

  const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_rsvp_and_promote', {
    p_session_id: sessionId,
    p_user_id: userId,
  });

  if (rpcError) return { ok: false, reason: 'not_found' };
  if (rpcResult === 'not_rsvped') return { ok: false, reason: 'not_rsvped' };

  if (rpcResult === 'going') {
    const startsAt = new Date(sessionData.starts_at).getTime();
    const isLate = sessionData.status === 'upcoming' && Date.now() > startsAt - HOURS_12_MS;
    if (isLate) {
      // The cancel itself already committed via cancel_rsvp_and_promote above — a failure
      // here is a lost penalty, not a failed cancel, so it must not flip ok to false.
      const { error: decrementError } = await supabase.rpc('decrement_reliability_score', {
        uids: [userId],
        points: LATE_CANCEL_PENALTY,
      });
      if (decrementError) {
        console.error(
          `cancelRsvp: decrement_reliability_score failed for user ${userId} (session ${sessionId})`,
          decrementError,
        );
        return { ok: true, warning: 'penalty_not_applied' };
      }
    }
  }

  return { ok: true };
}