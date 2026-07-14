import type {
  SessionType,
  SessionFormat,
  SessionVisibility,
  ShuttlePolicy,
  SessionStatus,
} from '@pavilion/types';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  drop_in: 'Drop-in',
  organizer_hosted: 'Organizer-hosted',
};

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  casual_rotation: 'Casual rotation',
  king_of_the_court: 'King of the court',
  round_robin: 'Round robin',
};

export const SESSION_VISIBILITY_LABELS: Record<SessionVisibility, string> = {
  public: 'Public',
  invite_only: 'Invite-only',
};

export const SHUTTLE_POLICY_LABELS: Record<ShuttlePolicy, string> = {
  bring_your_own: 'Bring your own',
  split_cost: 'Split cost',
  provided: 'Provided',
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  upcoming: 'Upcoming',
  active: 'In progress',
  voting: 'Voting',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Local-time `YYYY-MM-DDTHH:mm` for seeding a <input type="datetime-local">
// from an ISO string (e.g. when opening the edit form for an existing session).
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Sensible non-empty default for a brand-new session's start time — tomorrow
// evening, a common drop-in/league slot — rather than leaving the field
// blank. Avoids the create form ever holding an empty startsAt (which would
// otherwise crash on submit via `new Date('').toISOString()`) and matches
// the same "context-aware defaults" treatment as the other create-form fields.
export function defaultStartsAtLocal(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T18:00`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Inclusive upper bound for a `YYYY-MM-DD` "to" date — midnight of that day
// would exclude every session later that same day, so push to the last
// millisecond of it before sending as `date_to`.
export function endOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "date1+"/"After date1" when only one bound is picked, "date1 - date2" when
// both are — matches the adaptive display the Date filter renders as its
// two underlying <input type="date"> values change.
export function formatDateRangeSummary(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${formatShortDate(dateFrom)} – ${formatShortDate(dateTo)}`;
  if (dateFrom) return `After ${formatShortDate(dateFrom)}`;
  if (dateTo) return `Before ${formatShortDate(dateTo)}`;
  return 'Any date';
}

export function formatSessionDateTime(startsAt: string): string {
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatSkillValue(value: number): string {
  // Trim a trailing zero hundredths digit (3.50 -> 3.5) but always keep at
  // least one decimal (3 -> 3.0) so the range reads as a rating, not an integer.
  const fixed = value.toFixed(2);
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
}

export function formatSkillRange(min: number, max: number): string {
  return `${formatSkillValue(min)}–${formatSkillValue(max)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Browse's search box auto-detects an exact session-id paste (e.g. from a
// shared link) vs. a plain-text venue-name search — see GET /api/sessions'
// id/name query params (session.router.ts).
export function isSessionId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

// Same bounds `rating.algorithm.ts` (server) enforces: MIN_SCORE = 1.0 is the
// scale floor, UNVERIFIED_CEILING = 7.99 is where peer-rated (non-pro-verified)
// players cap out — see technical-notes.md's "Rating System". Not imported
// directly since they're server-internal constants, not part of @pavilion/types.
const MIN_SCORE = 1.0;
const UNVERIFIED_CEILING = 7.99;

// sessions.skill_min/skill_max are numeric(4,2) (database-schema.md) — a
// value whose integer part has more than 2 digits (>= 100) overflows
// Postgres's numeric type. The server enforces this (session.router.ts's
// validateSessionFieldValues); mirrored here so the create/edit form can't
// even submit an out-of-range value in the first place, rather than relying
// solely on the round-trip 400.
export const MIN_SKILL_INPUT = MIN_SCORE;
export const MAX_SKILL_INPUT = 99.99;

function clampSkill(value: number): number {
  return Math.min(UNVERIFIED_CEILING, Math.max(MIN_SCORE, value));
}

// Default Browse skill filter, computed per user rather than a fixed global
// range: mirrors session.service.ts's joinSession asymmetric RSVP tolerance
// (playing up blocked beyond 1.5 grades below, playing down beyond 3.0 above)
// so the default view roughly matches the sessions this user could actually
// join without a skill-block warning.
export function computeDefaultSkillRange(grade: number): { skillMin: string; skillMax: string } {
  return {
    skillMin: formatSkillValue(clampSkill(grade - 1.5)),
    skillMax: formatSkillValue(clampSkill(grade + 3.0)),
  };
}

// Fallback when a rating can't be resolved (fetch failure) — the full
// achievable-without-verification range, same as the pre-personalization
// default, rather than guessing a narrower band with nothing to base it on.
export const FALLBACK_SKILL_RANGE = { skillMin: formatSkillValue(MIN_SCORE), skillMax: formatSkillValue(UNVERIFIED_CEILING) };
