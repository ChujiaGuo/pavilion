import { supabase } from '../../lib/supabase.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { AdminGrant, AdminRole, AdminHistoryEntry, AdminHistoryFieldChange } from '@pavilion/types';

type AdminRow = {
  user_id: string;
  role: string;
  granted_by: string | null;
  created_at: string;
  profiles: { display_name: string } | { display_name: string }[] | null;
};

function toAdminGrant(row: AdminRow): AdminGrant {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    userId: row.user_id,
    displayName: profile?.display_name ?? 'Unknown',
    role: row.role as AdminRole,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  };
}

export type ListAdminsResult =
  | { ok: true; admins: AdminGrant[] }
  | { ok: false; reason: 'forbidden' };

export async function listAdmins(callerId: string): Promise<ListAdminsResult> {
  const callerRole = await getAdminRole(callerId);
  if (!roleAtLeast(callerRole, 'owner')) return { ok: false, reason: 'forbidden' };

  const { data, error } = await supabase
    .from('admins')
    .select('user_id, role, granted_by, created_at, profiles!admins_user_id_fkey(display_name)')
    .order('created_at', { ascending: true });

  if (error || !data) return { ok: true, admins: [] };
  return { ok: true, admins: (data as unknown as AdminRow[]).map(toAdminGrant) };
}

export type SetRoleResult =
  | { ok: true; grant: AdminGrant }
  | { ok: false; reason: 'forbidden' | 'not_found' };

export async function setAdminRole(
  callerId: string,
  targetUserId: string,
  role: AdminRole,
): Promise<SetRoleResult> {
  const callerRole = await getAdminRole(callerId);
  if (!roleAtLeast(callerRole, 'owner')) return { ok: false, reason: 'forbidden' };

  const { data: existing } = await supabase
    .from('admins')
    .select('role')
    .eq('user_id', targetUserId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('admins')
    .upsert({ user_id: targetUserId, role, granted_by: callerId }, { onConflict: 'user_id' })
    .select('user_id, role, granted_by, created_at, profiles!admins_user_id_fkey(display_name)')
    .single();

  if (error || !data) return { ok: false, reason: 'not_found' };

  const { error: auditError } = await supabase.from('admin_role_changes').insert({
    target_user_id: targetUserId,
    old_role: existing?.role ?? null,
    new_role: role,
    changed_by: callerId,
  });
  if (auditError) {
    console.error(`setAdminRole: audit insert failed for target ${targetUserId}`, auditError);
  }

  return { ok: true, grant: toAdminGrant(data as unknown as AdminRow) };
}

export type RemoveRoleResult = { ok: true } | { ok: false; reason: 'forbidden' | 'not_found' };

export async function removeAdminRole(
  callerId: string,
  targetUserId: string,
): Promise<RemoveRoleResult> {
  const callerRole = await getAdminRole(callerId);
  if (!roleAtLeast(callerRole, 'owner')) return { ok: false, reason: 'forbidden' };

  const { data: existing } = await supabase
    .from('admins')
    .select('role')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: 'not_found' };

  const { error } = await supabase.from('admins').delete().eq('user_id', targetUserId);
  if (error) return { ok: false, reason: 'not_found' };

  const { error: auditError } = await supabase.from('admin_role_changes').insert({
    target_user_id: targetUserId,
    old_role: existing.role,
    new_role: null,
    changed_by: callerId,
  });
  if (auditError) {
    console.error(`removeAdminRole: audit insert failed for target ${targetUserId}`, auditError);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Unified admin history feed
// ---------------------------------------------------------------------------
//
// One merged, role-scoped "who did what to whom, when" feed spanning every
// admin-override action across domains — see technical-notes.md "Admin &
// Roles". Visibility mirrors each entry type's own gating tier exactly (a
// caller sees an entry type iff their role outranks that type's minimum),
// so there's a single source of truth (the role ranks in lib/admin.ts)
// rather than a parallel permission list.

type NameRef = { display_name: string } | { display_name: string }[] | null;

function displayName(ref: NameRef): string {
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.display_name ?? 'Unknown';
}

const HISTORY_LIMIT_PER_SOURCE = 50;
const HISTORY_TOTAL_LIMIT = 50;

type RoleChangeRow = {
  id: string;
  old_role: string | null;
  new_role: string | null;
  created_at: string;
  target: NameRef;
  changer: NameRef;
};

async function fetchRoleChangeEntries(): Promise<AdminHistoryEntry[]> {
  const { data, error } = await supabase
    .from('admin_role_changes')
    .select(
      'id, old_role, new_role, created_at, ' +
        'target:profiles!admin_role_changes_target_user_id_fkey(display_name), ' +
        'changer:profiles!admin_role_changes_changed_by_fkey(display_name)',
    )
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT_PER_SOURCE);

  if (error || !data) return [];
  return (data as unknown as RoleChangeRow[]).map((row) => ({
    id: row.id,
    domain: 'role',
    action: row.new_role === null ? 'revoke' : row.old_role === null ? 'grant' : 'change_role',
    targetLabel: displayName(row.target),
    performedByDisplayName: displayName(row.changer),
    createdAt: row.created_at,
    changes: [{ field: 'role', before: row.old_role, after: row.new_role }],
  }));
}

type UserEditRow = {
  id: string;
  created_at: string;
  changes: AdminHistoryFieldChange[] | null;
  target: NameRef;
  performer: NameRef;
};

async function fetchUserEditEntries(): Promise<AdminHistoryEntry[]> {
  const { data, error } = await supabase
    .from('admin_user_edits')
    .select(
      'id, created_at, changes, ' +
        'target:profiles!admin_user_edits_target_user_id_fkey(display_name), ' +
        'performer:profiles!admin_user_edits_performed_by_fkey(display_name)',
    )
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT_PER_SOURCE);

  if (error || !data) return [];
  return (data as unknown as UserEditRow[]).map((row) => ({
    id: row.id,
    domain: 'user',
    action: 'edit',
    targetLabel: displayName(row.target),
    performedByDisplayName: displayName(row.performer),
    createdAt: row.created_at,
    changes: row.changes ?? null,
  }));
}

type SessionEditRow = {
  id: string;
  action: string;
  created_at: string;
  changes: AdminHistoryFieldChange[] | null;
  sessions: { venue_name: string } | { venue_name: string }[] | null;
  performer: NameRef;
};

async function fetchSessionEditEntries(): Promise<AdminHistoryEntry[]> {
  const { data, error } = await supabase
    .from('admin_session_edits')
    .select('id, action, created_at, changes, sessions(venue_name), performer:profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT_PER_SOURCE);

  if (error || !data) return [];
  return (data as unknown as SessionEditRow[]).map((row) => {
    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    return {
      id: row.id,
      domain: 'session',
      action: row.action,
      targetLabel: session?.venue_name ?? 'Unknown',
      performedByDisplayName: displayName(row.performer),
      createdAt: row.created_at,
      changes: row.changes ?? null,
    };
  });
}

type VenueEditRow = {
  id: string;
  action: string;
  created_at: string;
  changes: AdminHistoryFieldChange[] | null;
  venues: { name: string } | { name: string }[] | null;
  performer: NameRef;
};

async function fetchVenueEditEntries(): Promise<AdminHistoryEntry[]> {
  const { data, error } = await supabase
    .from('admin_venue_edits')
    .select('id, action, created_at, changes, venues(name), performer:profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT_PER_SOURCE);

  if (error || !data) return [];
  return (data as unknown as VenueEditRow[]).map((row) => {
    const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
    return {
      id: row.id,
      domain: 'venue',
      action: row.action,
      targetLabel: venue?.name ?? 'Unknown',
      performedByDisplayName: displayName(row.performer),
      createdAt: row.created_at,
      changes: row.changes ?? null,
    };
  });
}

type RatingAdjustmentRow = {
  id: string;
  created_at: string;
  score_before: number;
  score_after: number;
  target: NameRef;
  performer: NameRef;
};

// Manual admin rating adjustments are rating_history rows with session_id
// IS NULL — peer-vote rows always have a real session_id (see
// technical-notes.md "Admin & Roles"). rating_history.user_id and
// .performed_by both reference profiles, so the embed needs the same
// !<fkey_name> disambiguation as admin_user_edits above.
async function fetchRatingAdjustmentEntries(): Promise<AdminHistoryEntry[]> {
  const { data, error } = await supabase
    .from('rating_history')
    .select(
      'id, created_at, score_before, score_after, ' +
        'target:profiles!rating_history_user_id_fkey(display_name), ' +
        'performer:profiles!rating_history_performed_by_fkey(display_name)',
    )
    .is('session_id', null)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT_PER_SOURCE);

  if (error || !data) return [];
  return (data as unknown as RatingAdjustmentRow[]).map((row) => ({
    id: row.id,
    domain: 'rating',
    action: 'adjust_rating',
    targetLabel: displayName(row.target),
    performedByDisplayName: displayName(row.performer),
    createdAt: row.created_at,
    changes: [{ field: 'score', before: Number(row.score_before), after: Number(row.score_after) }],
  }));
}

export type ListAdminHistoryResult =
  | { ok: true; entries: AdminHistoryEntry[] }
  | { ok: false; reason: 'forbidden' };

export async function listAdminHistory(callerId: string): Promise<ListAdminHistoryResult> {
  const callerRole = await getAdminRole(callerId);
  if (callerRole === null) return { ok: false, reason: 'forbidden' };

  const sources: Promise<AdminHistoryEntry[]>[] = [];
  if (roleAtLeast(callerRole, 'venue_verifier')) sources.push(fetchVenueEditEntries());
  if (roleAtLeast(callerRole, 'moderator')) {
    sources.push(fetchUserEditEntries());
    sources.push(fetchSessionEditEntries());
  }
  if (roleAtLeast(callerRole, 'admin')) sources.push(fetchRatingAdjustmentEntries());
  if (roleAtLeast(callerRole, 'owner')) sources.push(fetchRoleChangeEntries());

  const results = await Promise.all(sources);
  const merged = results
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, HISTORY_TOTAL_LIMIT);

  return { ok: true, entries: merged };
}
