import { supabaseAdmin } from './supabase-admin';
import type { AdminRole } from '@pavilion/types';

// Direct DB insert -- mirrors venue-fixtures.ts/session-fixtures.ts. Grants
// the given fixture user an admins row so admin-gated UI (the /admin page's
// tabs, venue.router.ts's admin branch) treats them as that role.
export async function grantAdminRole(userId: string, role: AdminRole = 'venue_verifier') {
  const { error } = await supabaseAdmin.from('admins').insert({ user_id: userId, role });
  if (error) throw new Error(`grantAdminRole failed: ${error.message}`);
}

export async function revokeAdminRole(userId: string) {
  await supabaseAdmin.from('admins').delete().eq('user_id', userId);
}
