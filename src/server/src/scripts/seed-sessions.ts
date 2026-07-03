// Seeds the local Supabase instance with a dedicated test user and a diverse
// spread of mock sessions for manual/local testing of the client's sessions
// feature. Safe to re-run — it deletes and recreates everything it owns
// (matched by a fixed list of emails) before inserting fresh data, rather
// than accumulating duplicates.
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
// organizers/attendees spanning the rating scale so sessions built around
// them read as plausible (e.g. an 8.5-rated verified organizer hosting a
// pro-tier clinic) rather than everyone being the same rating.
const USERS: SeedUserSpec[] = [
  {
    key: 'testUser',
    email: 'testuser123@example.com',
    password: TEST_USER_PASSWORD,
    displayName: 'Test User',
    city: 'Rockville',
    region: 'MD',
    internalScore: 4.5,
  },
  {
    key: 'beginner',
    email: 'seed-beginner@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Beginner Betty',
    city: 'Rockville',
    region: 'MD',
    internalScore: 1.5,
  },
  {
    key: 'recreational',
    email: 'seed-recreational@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Recreational Randy',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 3.0,
  },
  {
    key: 'intermediate',
    email: 'seed-intermediate@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Intermediate Iris',
    city: 'Rockville',
    region: 'MD',
    internalScore: 4.75,
  },
  {
    key: 'advanced',
    email: 'seed-advanced@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Advanced Alex',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 6.25,
  },
  {
    key: 'elite',
    email: 'seed-elite@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Elite Erin',
    city: 'Rockville',
    region: 'MD',
    internalScore: 7.9,
  },
  {
    key: 'pro',
    email: 'seed-pro@example.test',
    password: TEST_USER_PASSWORD,
    displayName: 'Pro Priya',
    city: 'Bethesda',
    region: 'MD',
    internalScore: 8.5,
    verifiedTier: 8,
    ratingFloor: 6.0,
    firstName: 'Priya',
    lastName: 'Patel',
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

// Nine sessions spanning the full rating scale, explicitly hitting the
// documented floor (1.00) and unverified ceiling (7.99) boundaries, plus a
// beyond-ceiling verified-pro session and an extreme full-spectrum outlier.
// The test user is host on two, attendee/waitlisted/attended on five, and
// absent from two (so Browse isn't 100% test-user-centric).
const SESSIONS: SeedSessionSpec[] = [
  {
    venueName: '[SEED] Beginner Court — floor boundary (1.00–2.50)',
    organizerKey: 'beginner',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: MIN_SCORE,
    skillMax: 2.5,
    courtCount: 1,
    maxPlayers: 8,
    startsInDays: 2,
    durationMinutes: 90,
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: null,
    notes: 'Seed data — hits the absolute skill floor (1.00).',
    status: 'upcoming',
    rsvps: [{ userKey: 'testUser', status: 'going', joinedOffsetMinutes: 0 }],
  },
  {
    venueName: '[SEED] Rec Center Rally (2.50–4.00)',
    organizerKey: 'testUser',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'public',
    skillMin: 2.5,
    skillMax: 4.0,
    courtCount: 2,
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
    venueName: '[SEED] Club Doubles Night — waitlist demo (3.50–5.50)',
    organizerKey: 'intermediate',
    type: 'organizer_hosted',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.5,
    skillMax: 5.5,
    courtCount: 1,
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
    venueName: '[SEED] Advanced League Play (5.50–7.00)',
    organizerKey: 'testUser',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 5.5,
    skillMax: 7.0,
    courtCount: 3,
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
    venueName: '[SEED] Elite Invitational — ceiling boundary (6.50–7.99)',
    organizerKey: 'elite',
    type: 'organizer_hosted',
    format: 'round_robin',
    visibility: 'invite_only',
    skillMin: 6.5,
    skillMax: UNVERIFIED_CEILING,
    courtCount: 2,
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
    venueName: '[SEED] Pro Circuit Clinic — beyond unverified ceiling (8.00–10.00)',
    organizerKey: 'pro',
    type: 'organizer_hosted',
    format: 'king_of_the_court',
    visibility: 'public',
    skillMin: 8.0,
    skillMax: 10.0,
    courtCount: 4,
    maxPlayers: 16,
    startsInDays: 10,
    durationMinutes: 120,
    shuttlePolicy: 'provided',
    shuttleTubePrice: null,
    notes: 'Seed data — verified-pro-tier range; test user not involved.',
    status: 'upcoming',
    rsvps: [{ userKey: 'elite', status: 'going', joinedOffsetMinutes: 0 }],
  },
  {
    venueName: '[SEED] Full Spectrum Open Play — extreme wide range (1.00–10.00)',
    organizerKey: 'recreational',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: MIN_SCORE,
    skillMax: 10.0,
    courtCount: 5,
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
      { userKey: 'pro', status: 'going', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: '[SEED] Thursday Completed Drop-in (3.00–5.00)',
    organizerKey: 'recreational',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.0,
    skillMax: 5.0,
    courtCount: 2,
    maxPlayers: 10,
    startsInDays: -3,
    durationMinutes: 90,
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: null,
    notes: 'Seed data — completed, for testing attendance/history views.',
    status: 'completed',
    rsvps: [
      { userKey: 'testUser', status: 'attended', joinedOffsetMinutes: 0 },
      { userKey: 'intermediate', status: 'attended', joinedOffsetMinutes: 1 },
      { userKey: 'advanced', status: 'no_show', joinedOffsetMinutes: 2 },
    ],
  },
  {
    venueName: '[SEED] Rained Out Session (3.00–6.00)',
    organizerKey: 'advanced',
    type: 'organizer_hosted',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: 3.0,
    skillMax: 6.0,
    courtCount: 2,
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
  const { error: deleteSessionsError } = await supabase.from('sessions').delete().in('organizer_id', ids);
  if (deleteSessionsError) throw deleteSessionsError;

  for (const user of existing) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }

  console.log(`Cleaned up ${existing.length} existing seed user(s) and their sessions.`);
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

async function createSessions(idByKey: Record<string, string>) {
  const sessionIds: string[] = [];

  for (const spec of SESSIONS) {
    const organizerId = idByKey[spec.organizerKey];
    const startsAt = daysFromNow(spec.startsInDays);

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        organizer_id: organizerId,
        venue_id: null,
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
    if (error || !session) throw new Error(`Failed to create session "${spec.venueName}": ${error?.message}`);

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

  console.log('Creating users...');
  const idByKey = await createUsers();

  console.log('Creating sessions + RSVPs...');
  await createSessions(idByKey);

  console.log('\nDone.');
  console.log(`Log in as the test user at http://localhost:3000/login`);
  console.log(`  Email:    testuser123@example.com`);
  console.log(`  Password: ${TEST_USER_PASSWORD}`);
  console.log(`\n${SESSIONS.length} sessions seeded, ${USERS.length} users seeded (all "[SEED]"-prefixed venue names).`);
}

main()
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
