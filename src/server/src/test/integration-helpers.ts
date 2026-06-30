import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { supabase } from '../lib/supabase.js';

export async function createTestUser(
  opts: {
    email?: string;
    internalScore?: number;
    ratingFloor?: number | null;
    placementSessionsRemaining?: number;
  } = {},
) {
  const email = opts.email ?? `test-${randomUUID()}@example.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`);
  }

  if (
    opts.internalScore !== undefined ||
    opts.ratingFloor !== undefined ||
    opts.placementSessionsRemaining !== undefined
  ) {
    const updates: Record<string, unknown> = {};
    if (opts.internalScore !== undefined) updates.internal_score = opts.internalScore;
    if (opts.ratingFloor !== undefined) updates.rating_floor = opts.ratingFloor;
    if (opts.placementSessionsRemaining !== undefined) {
      updates.placement_sessions_remaining = opts.placementSessionsRemaining;
    }
    const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', data.user.id);
    if (updateError) throw new Error(`createTestUser profile patch failed: ${updateError.message}`);
  }

  return data.user;
}

export async function makeAdmin(userId: string) {
  const { error } = await supabase.from('admins').insert({ user_id: userId });
  if (error) throw new Error(`makeAdmin failed: ${error.message}`);
}

export async function createSessionWithParticipants(organizerId: string, participantIds: string[]) {
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      organizer_id: organizerId,
      venue_name: 'Test Venue',
      type: 'drop_in',
      format: 'casual_rotation',
      skill_min: 0,
      skill_max: 10,
      court_count: 1,
      max_players: 8,
      starts_at: new Date().toISOString(),
      duration_minutes: 90,
      shuttle_policy: 'bring_your_own',
    })
    .select()
    .single();
  if (error || !session) {
    throw new Error(`createSessionWithParticipants failed: ${error?.message ?? 'no session returned'}`);
  }

  const rsvpRows = [organizerId, ...participantIds].map((user_id) => ({
    session_id: session.id,
    user_id,
    status: 'going',
  }));
  const { error: rsvpError } = await supabase.from('session_rsvps').insert(rsvpRows);
  if (rsvpError) throw new Error(`createSessionWithParticipants RSVP insert failed: ${rsvpError.message}`);

  return session as { id: string };
}

let pgClient: Client | null = null;
let pgConnected = false;

function getPgClient(): Client {
  if (!pgClient) {
    pgClient = new Client({
      connectionString:
        process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
  }
  return pgClient;
}

export async function truncateAll() {
  const client = getPgClient();
  if (!pgConnected) {
    await client.connect();
    pgConnected = true;
  }
  // No RESTART IDENTITY: every table here uses a uuid PK, and the local
  // `postgres` role isn't a true superuser — it can't reset sequences it
  // doesn't own, like auth's internal refresh_tokens_id_seq, which CASCADE
  // would otherwise try to touch.
  await client.query('TRUNCATE TABLE auth.users, venues CASCADE');
}

export async function closePgClient() {
  if (pgClient && pgConnected) {
    await pgClient.end();
  }
  pgClient = null;
  pgConnected = false;
}