import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

export async function createFixtureUser(opts: { onboardingCompleted?: boolean } = {}) {
  const { onboardingCompleted = true } = opts;
  const email = `e2e-${randomUUID()}@example.test`;
  const password = 'password123';
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(onboardingCompleted ? { app_metadata: { onboarding_completed: true } } : {}),
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);
  return { userId: data.user.id, email, password };
}

export async function deleteFixtureUser(userId: string) {
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
}

type SessionOverrides = Partial<{
  venue_name: string;
  visibility: 'public' | 'invite_only';
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  skill_min: number;
  skill_max: number;
  starts_at: string;
}>;

// Direct DB insert rather than going through the create-session UI/API —
// mirrors onboarding-quiz.spec.ts's direct `profiles` reads/writes. Defaults
// land comfortably inside a freshly onboarded (skipped-quiz) user's default
// Browse skill filter (grade 2 -> computeDefaultSkillRange gives 1.0-5.0) and
// two days in the future so the default `upcoming` + today-onward date filter
// always includes it.
export async function createFixtureSession(organizerId: string, overrides: SessionOverrides = {}) {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      organizer_id: organizerId,
      venue_name: `E2E Venue ${randomUUID().slice(0, 8)}`,
      type: 'drop_in',
      format: 'casual_rotation',
      visibility: 'public',
      skill_min: 2,
      skill_max: 5,
      court_count: 1,
      max_players: 8,
      starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      duration_minutes: 60,
      shuttle_policy: 'bring_your_own',
      ...overrides,
    })
    .select('id, venue_name')
    .single();
  if (error || !data) throw new Error(`fixture session creation failed: ${error?.message}`);
  return data as { id: string; venue_name: string };
}

export async function deleteFixtureSession(id: string) {
  await supabaseAdmin.from('sessions').delete().eq('id', id);
}
