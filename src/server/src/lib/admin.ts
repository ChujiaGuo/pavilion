import { supabase } from './supabase.js';
import type { AdminRole } from '@pavilion/types';

// Shared infra, not a domain — importable from any domain's service without
// violating the no-cross-domain-import rule (same category as supabase.js /
// middleware/auth.ts). Owns only the role-rank comparison; the `admins`
// table's own CRUD (listing/granting/revoking rows) lives in the `admin`
// domain, which is the one place that actually owns that table.

const ROLE_RANK: Record<AdminRole, number> = {
  venue_verifier: 1,
  moderator: 2,
  admin: 3,
  owner: 4,
};

export async function getAdminRole(userId: string): Promise<AdminRole | null> {
  const { data } = await supabase
    .from('admins')
    .select('role')
    .eq('user_id', userId)
    .single();

  return (data?.role as AdminRole | undefined) ?? null;
}

export function roleAtLeast(role: AdminRole | null, min: AdminRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}
