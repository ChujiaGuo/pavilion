// Seeds four accounts, one at each admin role, for manually testing the
// admin/moderation page's role-gated tabs. Modeled directly on
// seed-sessions.ts — delete-and-recreate by a fixed email list, so it's safe
// to re-run rather than accumulating duplicates.
//
// Usage (from src/server): npm run seed:admins
//
// Requires `supabase start` running locally and src/server/.env.local
// populated (same prerequisites as `npm run dev`).
import { supabase } from '../lib/supabase.js';
import type { AdminRole } from '@pavilion/types';

const PASSWORD = 'password';

interface SeedAdminSpec {
  email: string;
  displayName: string;
  role: AdminRole;
}

const ADMINS: SeedAdminSpec[] = [
  { email: 'testvenue@example.test', displayName: 'Test Venue Verifier', role: 'venue_verifier' },
  { email: 'testmod@example.test', displayName: 'Test Moderator', role: 'moderator' },
  { email: 'testadmin@example.test', displayName: 'Test Admin', role: 'admin' },
  { email: 'testowner@example.test', displayName: 'Test Owner', role: 'owner' },
];

async function deleteExistingSeedData(emails: string[]) {
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;

  const existing = usersPage.users.filter((u) => u.email && emails.includes(u.email));
  if (existing.length === 0) return;

  for (const user of existing) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }

  console.log(`Cleaned up ${existing.length} existing seed admin account(s).`);
}

async function createAdmins() {
  for (const spec of ADMINS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { onboarding_completed: true },
      user_metadata: { display_name: spec.displayName },
    });
    if (error || !data.user) throw new Error(`Failed to create ${spec.email}: ${error?.message}`);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        privacy_level: 'public',
        placement_sessions_remaining: 0,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', data.user.id);
    if (profileError) throw new Error(`Failed to update profile for ${spec.email}: ${profileError.message}`);

    // Direct table write via the service-role client — bypasses the
    // app-layer owner-only check on purpose, same as this script bypasses
    // other privileged fields (verifiedTier, ratingFloor) in seed-sessions.ts.
    // There's no existing owner to grant this through the API yet.
    const { error: adminError } = await supabase
      .from('admins')
      .upsert({ user_id: data.user.id, role: spec.role, granted_by: null }, { onConflict: 'user_id' });
    if (adminError) throw new Error(`Failed to grant role for ${spec.email}: ${adminError.message}`);

    console.log(`Created: ${spec.displayName} <${spec.email}> — role: ${spec.role}`);
  }
}

async function main() {
  const emails = ADMINS.map((a) => a.email);

  console.log('Cleaning up any previous run...');
  await deleteExistingSeedData(emails);

  console.log('Creating admin accounts...');
  await createAdmins();

  console.log('\nDone. Log in at http://localhost:3000/login with any of:');
  for (const spec of ADMINS) {
    console.log(`  ${spec.role.padEnd(14)} ${spec.email} / ${PASSWORD}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
