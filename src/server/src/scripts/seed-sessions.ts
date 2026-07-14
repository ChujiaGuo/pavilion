// Seeds the local Supabase instance with a dedicated test user and a diverse
// spread of mock sessions for manual/local testing of the client's sessions
// feature. Safe to re-run — it deletes and recreates everything it owns
// (matched by a fixed list of emails) before inserting fresh data, rather
// than accumulating duplicates.
//
// Depends on venues.ts: sessions below link to real venue rows by name
// (`venue_id` + `venue_name`, matching how session.service.ts's createSession
// populates both from a selected venue), so those venues must already exist.
// Run `npm run seed:venues` first (or `npm run seed:all`, which already
// orders venues before sessions) — this script throws a clear error if no
// "[SEED]"-prefixed venues are found rather than silently falling back to
// venue_id: null.
//
// Usage (from src/server): npm run seed:sessions
//
// Requires `supabase start` running locally and src/server/.env.local
// populated (same prerequisites as `npm run dev`).
import { supabase } from '../lib/supabase.js';
import type {
  SessionType,
  SessionFormat,
  SessionVisibility,
  ShuttlePolicy,
  SessionStatus,
  RsvpStatus,
} from '@pavilion/types';

// Same bounds rating.algorithm.ts enforces server-side (MIN_SCORE / UNVERIFIED_CEILING)
// — see technical-notes.md's "Rating System". Mirrored here, not imported, since
// they're server-internal constants rather than part of @pavilion/types.
const MIN_SCORE = 1.0;
const UNVERIFIED_CEILING = 7.99;

// Matches venues.ts's SEED_PREFIX — kept as a separate literal (not a
// shared import) since these are two independently-runnable scripts, but the
// full venue names below must match venues.ts's VENUES exactly.
const VENUE_SEED_PREFIX = '[SEED]';

// Short handles for the venues venues.ts creates, so SESSIONS below can
// reference them without retyping the full prefixed name. Every one of
// venues.ts's 10 venues is used at least once across the sessions below.
const VENUE = {
  rockville: `${VENUE_SEED_PREFIX} Rockville Badminton Club`,
  bethesda: `${VENUE_SEED_PREFIX} Bethesda Community Rec Center`,
  twinbrook: `${VENUE_SEED_PREFIX} Twinbrook Community Center`,
  pulse: `${VENUE_SEED_PREFIX} Pulse Fitness & Racquet Club`,
  shadyGrove: `${VENUE_SEED_PREFIX} Shady Grove Outdoor Courts`,
  eliteSmash: `${VENUE_SEED_PREFIX} Elite Smash Academy`,
  fairfax: `${VENUE_SEED_PREFIX} Far Out Fairfax Fieldhouse`,
  silverSpring: `${VENUE_SEED_PREFIX} Silver Spring Shuttle House`,
  wheaton: `${VENUE_SEED_PREFIX} Wheaton Community Courts`,
  germantown: `${VENUE_SEED_PREFIX} Germantown Gym & Fitness`,
} as const;

const TEST_USER_PASSWORD = 'password';

interface SeedUserSpec {
  key: string;
  email: string;
  password: string;
  displayName: string;
  city: string;
  region: string;
  internalScore: number;
  verifiedTier?: number;
  ratingFloor?: number;
  // Required by the profiles_verified_requires_name CHECK constraint
  // whenever verifiedTier is set — see technical-notes.md's "Verification
  // approval action".
  firstName?: string;
  lastName?: string;
}

// The one credential set the task asked for, plus a spread of mock
// organizers/attendees covering every whole grade from 1 through 10+ (see
// rating.algorithm.ts's `grade = floor(score)`), so the past sessions below
// can put a plausible real organizer/attendee at every skill band instead of
// clustering everyone in the middle of the scale.
const USERS: SeedUserSpec[] = [
  {
    key: 'testUser',
    email: 'testuser@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Test User',
    city: 'Rockville',
    region: 'MD',
    internalScore: 4.5,
  },
  {
    key: 'beginner',
    email: 'beginner@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Beginner Betty',
    city: 'Rockville',
    region: 'MD',
    internalScore: 1.5, // grade 1
  },
  {
    key: 'novice',
    email: 'novice@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Novice Nora',
    city: 'Rockville',
    region: 'MD',
    internalScore: 2.25, // grade 2
  },
  {
    key: 'recreational',
    email: 'recreational@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Recreational Randy',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 3.0, // grade 3
  },
  {
    key: 'intermediate',
    email: 'intermediate@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Intermediate Iris',
    city: 'Rockville',
    region: 'MD',
    internalScore: 4.75, // grade 4
  },
  {
    key: 'steady',
    email: 'steady@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Steady Sam',
    city: 'Silver Spring',
    region: 'MD',
    internalScore: 5.5, // grade 5
  },
  {
    key: 'advanced',
    email: 'advanced@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Advanced Alex',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 6.25, // grade 6
  },
  {
    key: 'elite',
    email: 'elite@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Elite Erin',
    city: 'Rockville',
    region: 'MD',
    internalScore: 7.9, // grade 7, sits right at the unverified ceiling
  },
  {
    key: 'pro',
    email: 'pro@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Pro Priya',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 8.5, // grade 8
    verifiedTier: 8,
    ratingFloor: 6.0,
    firstName: 'Priya',
    lastName: 'Patel',
  },
  {
    key: 'veteran',
    email: 'veteran@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Veteran Vic',
    city: 'Wheaton',
    region: 'MD',
    internalScore: 9.2, // grade 9
    verifiedTier: 9,
    ratingFloor: 6.0,
    firstName: 'Vic',
    lastName: 'Voss',
  },
  {
    key: 'legend',
    email: 'legend@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Legend Lena',
    city: 'Germantown',
    region: 'MD',
    internalScore: 10.5, // grade 10 — profiles.internal_score is intentionally unbounded above 10
    verifiedTier: 10,
    ratingFloor: 6.0,
    firstName: 'Lena',
    lastName: 'Lindqvist',
  },
];

interface SeedSessionSpec {
  venueName: string;
  organizerKey: string;
  type: SessionType;
  format: SessionFormat;
  visibility: SessionVisibility;
  skillMin: number;
  skillMax: number;
  courtCount: number;
  maxPlayers: number;
  startsInDays: number; // negative = in the past
  durationMinutes: number;
  shuttlePolicy: ShuttlePolicy;
  shuttleTubePrice: number | null;
  notes: string | null;
  status: SessionStatus;
  rsvps: { userKey: string; status: RsvpStatus; joinedOffsetMinutes: number }[];
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Ten completed/voting (past) sessions, one per venue, covering every whole
// grade from 1 through 10+ — explicitly hitting the documented floor (1.00)
// and unverified ceiling (7.99) boundaries, plus a beyond-10 "unbounded above
// 10" exhibition session. Each carries a realistic organizer + a handful of
// attendees drawn from adjacent grades (kept within the asymmetric
// playing-up/playing-down tolerances Skill Range Enforcement documents, for
// narrative consistency even though this script writes directly to the DB
// and bypasses that check). The test user attends/no-shows a spread of these
// so its own history isn't limited to sessions it organized. One of the ten
// (grade 5, Pulse Fitness) is seeded straight into 'voting' with attendance
// already marked (the first step within voting — see technical-notes.md's
// "Session Status Lifecycle") rather than 'completed', which is currently
// unreachable outside seed data, so the dashboard's "Ready to rate" section
// always has a real example to show.
//
// Seven more sessions (six upcoming, one cancelled) round things out for
// non-history flows: hosting, waitlisting, invite-only, and cancellation.
const SESSIONS: SeedSessionSpec[] = [
  // --- Past sessions (completed/voting), grade 1 through grade 10+ ---
  {
    venueName: VENUE.shadyGrove,
    organizerKey: 'beginner',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: MIN_SCORE,
    skillMax: 2.0,
    courtCount: 2,
    maxPlayers: 8,
    startsInDays: -35,
    durationMinutes: 90,
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 1 band, hits the absolute skill floor (1.00). Beginner clinic.',
    status: 'completed',
    rsvps: [
      { userKey: 'novice', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'testUser', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'recreational', status: 'no_show', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.twinbrook,
    organizerKey: 'novice',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'public',
    skillMin: 2.0,
    skillMax: 3.0,
    courtCount: 2,
    maxPlayers: 10,
    startsInDays: -32,
    durationMinutes: 90,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 5.0,
    notes: 'Seed data — grade 2 band. Footwork fundamentals.',
    status: 'completed',
    rsvps: [
      { userKey: 'beginner', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'recreational', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'testUser', status: 'attended', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.rockville,
    organizerKey: 'recreational',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.0,
    skillMax: 4.0,
    courtCount: 4,
    maxPlayers: 16,
    startsInDays: -30,
    durationMinutes: 120,
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 3 band. Rec league rally.',
    status: 'completed',
    rsvps: [
      { userKey: 'novice', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'intermediate', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'testUser', status: 'no_show', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.bethesda,
    organizerKey: 'intermediate',
    type: 'organizer_hosted',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 4.0,
    skillMax: 5.0,
    courtCount: 3,
    maxPlayers: 12,
    startsInDays: -28,
    durationMinutes: 90,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 4 band. Weeknight doubles.',
    status: 'completed',
    rsvps: [
      { userKey: 'testUser', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'recreational', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'steady', status: 'attended', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.pulse,
    organizerKey: 'steady',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 5.0,
    skillMax: 6.0,
    courtCount: 3,
    maxPlayers: 12,
    startsInDays: -25,
    durationMinutes: 90,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 6.5,
    notes: 'Seed data — grade 5 band. Steady climbers meetup. Sits in the voting stage with attendance already marked (the first step within voting).',
    status: 'voting',
    rsvps: [
      { userKey: 'intermediate', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'advanced', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'testUser', status: 'attended', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.eliteSmash,
    organizerKey: 'advanced',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'public',
    skillMin: 6.0,
    skillMax: 7.0,
    courtCount: 6,
    maxPlayers: 20,
    startsInDays: -21,
    durationMinutes: 120,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 6 band. Advanced league play.',
    status: 'completed',
    rsvps: [
      { userKey: 'steady', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'elite', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'testUser', status: 'no_show', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.silverSpring,
    organizerKey: 'elite',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'invite_only',
    skillMin: 7.0,
    skillMax: UNVERIFIED_CEILING,
    courtCount: 4,
    maxPlayers: 12,
    startsInDays: -18,
    durationMinutes: 90,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 7 band, hits the unverified-ceiling boundary (7.99); invite-only. Test user is too far below this range to plausibly join.',
    status: 'completed',
    rsvps: [
      { userKey: 'advanced', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'pro', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'veteran', status: 'attended', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.wheaton,
    organizerKey: 'pro',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 8.0,
    skillMax: 9.0,
    courtCount: 3,
    maxPlayers: 12,
    startsInDays: -14,
    durationMinutes: 120,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 8 band, verified-pro-tier range. Pro circuit clinic.',
    status: 'completed',
    rsvps: [
      { userKey: 'elite', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'veteran', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'legend', status: 'attended', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.germantown,
    organizerKey: 'veteran',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'invite_only',
    skillMin: 9.0,
    skillMax: 10.0,
    courtCount: 1,
    maxPlayers: 4,
    startsInDays: -10,
    durationMinutes: 90,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 9 band, invite-only. Veteran invitational.',
    status: 'completed',
    rsvps: [
      { userKey: 'pro', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'legend', status: 'attended', joinedOffsetMinutes: 1 },
    ],
  },
  {
    venueName: VENUE.fairfax,
    organizerKey: 'legend',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 10.0,
    skillMax: 12.0,
    courtCount: 5,
    maxPlayers: 16,
    startsInDays: -5,
    durationMinutes: 120,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — grade 10+ band, deliberately beyond 10.00 (internal_score is unbounded above 10). Legend exhibition.',
    status: 'completed',
    rsvps: [
      { userKey: 'veteran', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'pro', status: 'no_show', joinedOffsetMinutes: 1 },
    ],
  },

  // --- Upcoming / cancelled sessions, for hosting/waitlist/invite/cancel flows ---
  {
    venueName: VENUE.bethesda,
    organizerKey: 'testUser',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'public',
    skillMin: 2.5,
    skillMax: 4.0,
    courtCount: 3,
    maxPlayers: 12,
    startsInDays: 3,
    durationMinutes: 90,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 6.0,
    notes: 'Seed data — test user hosting.',
    status: 'upcoming',
    rsvps: [
      { userKey: 'recreational', status: 'going', joinedOffsetMinutes: 0 },
      { userKey: 'intermediate', status: 'going', joinedOffsetMinutes: 1 },
    ],
  },
  {
    venueName: VENUE.eliteSmash,
    organizerKey: 'intermediate',
    type: 'organizer_hosted',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.5,
    skillMax: 5.5,
    courtCount: 6,
    maxPlayers: 2,
    startsInDays: 4,
    durationMinutes: 60,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — capacity 2, already full; test user is waitlisted.',
    status: 'upcoming',
    rsvps: [
      { userKey: 'advanced', status: 'going', joinedOffsetMinutes: 0 },
      { userKey: 'recreational', status: 'going', joinedOffsetMinutes: 1 },
      { userKey: 'testUser', status: 'waitlisted', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.rockville,
    organizerKey: 'testUser',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 5.5,
    skillMax: 7.0,
    courtCount: 8,
    maxPlayers: 12,
    startsInDays: 5,
    durationMinutes: 120,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 7.5,
    notes: 'Seed data — test user hosting.',
    status: 'upcoming',
    rsvps: [
      { userKey: 'advanced', status: 'going', joinedOffsetMinutes: 0 },
      { userKey: 'elite', status: 'going', joinedOffsetMinutes: 1 },
    ],
  },
  {
    venueName: VENUE.silverSpring,
    organizerKey: 'elite',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'invite_only',
    skillMin: 6.5,
    skillMax: UNVERIFIED_CEILING,
    courtCount: 4,
    maxPlayers: 8,
    startsInDays: 7,
    durationMinutes: 90,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — hits the unverified-ceiling boundary (7.99); invite-only.',
    status: 'upcoming',
    rsvps: [{ userKey: 'testUser', status: 'going', joinedOffsetMinutes: 0 }],
  },
  {
    venueName: VENUE.twinbrook,
    organizerKey: 'recreational',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: MIN_SCORE,
    skillMax: 10.0,
    courtCount: 2,
    maxPlayers: 20,
    startsInDays: 14,
    durationMinutes: 180,
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: null,
    notes: 'Seed data — deliberately spans the entire rating scale.',
    status: 'upcoming',
    rsvps: [
      { userKey: 'testUser', status: 'going', joinedOffsetMinutes: 0 },
      { userKey: 'beginner', status: 'going', joinedOffsetMinutes: 1 },
      { userKey: 'legend', status: 'going', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: VENUE.wheaton,
    organizerKey: 'veteran',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'public',
    skillMin: 8.5,
    skillMax: 10.0,
    courtCount: 3,
    maxPlayers: 8,
    startsInDays: 21,
    durationMinutes: 90,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 8.0,
    notes: 'Seed data — upcoming top-tier session, test user not involved.',
    status: 'upcoming',
    rsvps: [{ userKey: 'pro', status: 'going', joinedOffsetMinutes: 0 }],
  },
  {
    venueName: VENUE.pulse,
    organizerKey: 'advanced',
    type: 'organizer_hosted',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.0,
    skillMax: 6.0,
    courtCount: 3,
    maxPlayers: 10,
    startsInDays: 1,
    durationMinutes: 90,
    shuttlePolicy: 'split_cost',
    shuttleTubePrice: 5.0,
    notes: 'Seed data — cancelled; RSVPs are untouched by cancellation (matches cancelSession, which only flips session.status).',
    status: 'cancelled',
    rsvps: [{ userKey: 'testUser', status: 'going', joinedOffsetMinutes: 0 }],
  },
];

async function deleteExistingSeedData(emails: string[]) {
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;

  const existing = usersPage.users.filter((u) => u.email && emails.includes(u.email));
  if (existing.length === 0) return;

  const ids = existing.map((u) => u.id);

  // sessions.organizer_id has no ON DELETE CASCADE from profiles (see
  // technical-notes.md's KI-004), so any session these users organized must
  // be deleted before the users themselves — session_rsvps does cascade off
  // sessions, so deleting the sessions is enough to clear those too.
  // admin_session_edits.session_id has no cascade either, so any audit row
  // logged against one of these sessions (e.g. from exercising the admin
  // sessions panel) must be cleared before the session delete too.
  const { data: ownedSessions, error: sessionSelectError } = await supabase
    .from('sessions')
    .select('id')
    .in('organizer_id', ids);
  if (sessionSelectError) throw sessionSelectError;

  if (ownedSessions && ownedSessions.length > 0) {
    const sessionIds = ownedSessions.map((s) => s.id);
    const { error: deleteAuditError } = await supabase.from('admin_session_edits').delete().in('session_id', sessionIds);
    if (deleteAuditError) throw deleteAuditError;
  }

  const { error: deleteSessionsError } = await supabase.from('sessions').delete().in('organizer_id', ids);
  if (deleteSessionsError) throw deleteSessionsError;

  for (const user of existing) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }

  console.log(`Cleaned up ${existing.length} existing seed user(s) and their sessions.`);
}

async function loadVenueIds(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('venues').select('id, name').ilike('name', `${VENUE_SEED_PREFIX}%`);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      `No "${VENUE_SEED_PREFIX}"-prefixed venues found. Run \`npm run seed:venues\` before seeding sessions.`,
    );
  }

  const byName: Record<string, string> = {};
  for (const row of data) byName[row.name] = row.id;
  return byName;
}

async function createUsers(): Promise<Record<string, string>> {
  const idByKey: Record<string, string> = {};

  for (const spec of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      app_metadata: { onboarding_completed: true },
      user_metadata: { display_name: spec.displayName },
    });
    if (error || !data.user) throw new Error(`Failed to create ${spec.email}: ${error?.message}`);

    idByKey[spec.key] = data.user.id;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        city: spec.city,
        region: spec.region,
        internal_score: spec.internalScore,
        privacy_level: 'public',
        placement_sessions_remaining: 0,
        onboarding_completed_at: new Date().toISOString(),
        ...(spec.firstName !== undefined ? { first_name: spec.firstName } : {}),
        ...(spec.lastName !== undefined ? { last_name: spec.lastName } : {}),
        ...(spec.verifiedTier !== undefined ? { verified_tier: spec.verifiedTier } : {}),
        ...(spec.ratingFloor !== undefined ? { rating_floor: spec.ratingFloor } : {}),
      })
      .eq('id', data.user.id);
    if (profileError) throw new Error(`Failed to update profile for ${spec.email}: ${profileError.message}`);
  }

  return idByKey;
}

async function createSessions(idByKey: Record<string, string>, venueIdByName: Record<string, string>) {
  const sessionIds: string[] = [];

  for (const spec of SESSIONS) {
    const organizerId = idByKey[spec.organizerKey];
    const venueId = venueIdByName[spec.venueName];
    if (!venueId) {
      throw new Error(
        `No seeded venue named "${spec.venueName}" — check it matches a name in venues.ts's VENUES exactly.`,
      );
    }
    const startsAt = daysFromNow(spec.startsInDays);

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        organizer_id: organizerId,
        venue_id: venueId,
        venue_name: spec.venueName,
        type: spec.type,
        format: spec.format,
        visibility: spec.visibility,
        skill_min: spec.skillMin,
        skill_max: spec.skillMax,
        strict_range: false,
        court_count: spec.courtCount,
        max_players: spec.maxPlayers,
        starts_at: startsAt,
        duration_minutes: spec.durationMinutes,
        shuttle_policy: spec.shuttlePolicy,
        shuttle_tube_price: spec.shuttleTubePrice,
        notes: spec.notes,
        status: spec.status,
      })
      .select('id')
      .single();
    if (error || !session) throw new Error(`Failed to create session at "${spec.venueName}": ${error?.message}`);

    sessionIds.push(session.id);

    if (spec.rsvps.length > 0) {
      const baseTime = Date.now();
      const rows = spec.rsvps.map((r) => ({
        session_id: session.id,
        user_id: idByKey[r.userKey],
        status: r.status,
        joined_at: new Date(baseTime + r.joinedOffsetMinutes * 60 * 1000).toISOString(),
      }));
      const { error: rsvpError } = await supabase.from('session_rsvps').insert(rows);
      if (rsvpError) throw new Error(`Failed to seed RSVPs for "${spec.venueName}": ${rsvpError.message}`);
    }

    console.log(`Created: ${spec.venueName} (${spec.status}, skill ${spec.skillMin}–${spec.skillMax})`);
  }

  return sessionIds;
}

async function main() {
  const emails = USERS.map((u) => u.email);

  console.log('Cleaning up any previous run...');
  await deleteExistingSeedData(emails);

  console.log('Looking up seeded venues...');
  const venueIdByName = await loadVenueIds();

  console.log('Creating users...');
  const idByKey = await createUsers();

  console.log('Creating sessions + RSVPs...');
  await createSessions(idByKey, venueIdByName);

  const pastCount = SESSIONS.filter((s) => s.status === 'completed' || s.status === 'voting').length;

  console.log('\nDone.');
  console.log(`Log in as the test user at http://localhost:3000/login`);
  console.log(`  Email:    ${USERS.find((u) => u.key === 'testUser')!.email}`);
  console.log(`  Password: ${TEST_USER_PASSWORD}`);
  console.log(
    `\n${SESSIONS.length} sessions seeded (${pastCount} past/completed), ${USERS.length} users seeded, linked to ${Object.keys(venueIdByName).length} seeded venues.`,
  );
}

main()
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
