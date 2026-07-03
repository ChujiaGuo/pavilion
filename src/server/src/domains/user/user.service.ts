import { supabase } from '../../lib/supabase.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { AdminHistoryFieldChange, User } from '@pavilion/types';

type UserRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  city: string;
  region: string;
  preferred_formats: string[];
  play_style: string;
  privacy_level: string;
  verified_tier: number | null;
  rating_floor: number | null;
  created_at: string;
};

const PROFILE_SELECT =
  'id, display_name, first_name, last_name, photo_url, city, region, preferred_formats, play_style, privacy_level, verified_tier, rating_floor, created_at';

type UserUpdateFields = Partial<Pick<User,
  'displayName' | 'firstName' | 'lastName' | 'photoUrl' | 'city' | 'region' | 'preferredFormats' | 'playStyle' | 'privacyLevel'
>>;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    city: row.city,
    region: row.region,
    preferredFormats: row.preferred_formats as User['preferredFormats'],
    playStyle: row.play_style as User['playStyle'],
    privacyLevel: row.privacy_level as User['privacyLevel'],
    verifiedTier: row.verified_tier,
    ratingFloor: row.rating_floor,
    createdAt: row.created_at,
  };
}

export async function getUserById(id: string, requesterId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;

  // Private profiles are only visible to the owner
  if (data.privacy_level === 'private' && data.id !== requesterId) return null;

  return toUser(data as UserRow);
}

export type SearchUsersResult =
  | { ok: true; users: User[] }
  | { ok: false; reason: 'forbidden' };

const SEARCH_RESULT_LIMIT = 50;

// Moderator+ only — deliberately bypasses the private-profile filter that
// getUserById enforces, since seeing private profiles is the entire point of
// moderator user search. Matches by exact id or a display_name substring;
// capped at SEARCH_RESULT_LIMIT so an unfiltered search can't pull hundreds of
// rows in one response (no pagination UI in v1 — narrow the query instead).
export async function searchUsers(
  callerId: string,
  query: { q?: string; id?: string },
): Promise<SearchUsersResult> {
  const callerRole = await getAdminRole(callerId);
  if (!roleAtLeast(callerRole, 'moderator')) return { ok: false, reason: 'forbidden' };

  let dbQuery = supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .is('deleted_at', null)
    .limit(SEARCH_RESULT_LIMIT);

  if (query.id) dbQuery = dbQuery.eq('id', query.id);
  if (query.q) dbQuery = dbQuery.ilike('display_name', `%${query.q}%`);

  const { data, error } = await dbQuery;
  if (error || !data) return { ok: true, users: [] };
  return { ok: true, users: (data as UserRow[]).map(toUser) };
}

export type UpdateUserResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_found' | 'name_locked' | 'verified_requires_name' };

// Only fields that are both present in the patch AND actually differ from
// their prior value are diffed — the admin edit form resubmits every field
// on save (not just the ones the admin touched), so comparing presence alone
// would pad every entry with no-op "X -> X" pairs for untouched fields.
function buildUserChanges(fields: UserUpdateFields, before: User, after: User): AdminHistoryFieldChange[] {
  return (Object.keys(fields) as (keyof UserUpdateFields)[])
    .filter((key) => fields[key] !== undefined && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ field: key, before: before[key], after: after[key] }));
}

export async function updateUser(
  id: string,
  fields: UserUpdateFields,
  opts?: { bypassNameLock?: boolean; performedBy?: string },
): Promise<UpdateUserResult> {
  // Once a profile is verified, first/last name are locked — they were
  // checked against the credentials that earned the verified_tier, so
  // letting them change afterward (to anything, not just null) would
  // decouple the verified badge from the identity it verified. The
  // profiles_verified_requires_name CHECK constraint only stops clearing
  // them to null; this is the app-layer rule that also stops changing them
  // to a different value. A moderator+ caller editing someone else's profile
  // (bypassNameLock) is explicitly allowed to fix a verified user's name —
  // this is the only branch that flag affects; every other check/write below
  // is unchanged.
  if (!opts?.bypassNameLock && (fields.firstName !== undefined || fields.lastName !== undefined)) {
    const { data: current } = await supabase
      .from('profiles')
      .select('verified_tier')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (current?.verified_tier != null) {
      return { ok: false, reason: 'name_locked' };
    }
  }

  // Audit-path-only pre-fetch — captures "before" values for the History
  // diff. Skipped on the self-edit path (opts.performedBy unset), so an
  // ordinary profile save doesn't pay for an extra read.
  const shouldAudit = Boolean(opts?.bypassNameLock && opts.performedBy);
  let before: User | null = null;
  if (shouldAudit) {
    const { data: currentRow } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (currentRow) before = toUser(currentRow as UserRow);
  }

  const updates: Record<string, unknown> = {};
  if (fields.displayName !== undefined) updates.display_name = fields.displayName;
  if (fields.firstName !== undefined) updates.first_name = fields.firstName;
  if (fields.lastName !== undefined) updates.last_name = fields.lastName;
  if (fields.photoUrl !== undefined) updates.photo_url = fields.photoUrl;
  if (fields.city !== undefined) updates.city = fields.city;
  if (fields.region !== undefined) updates.region = fields.region;
  if (fields.preferredFormats !== undefined) updates.preferred_formats = fields.preferredFormats;
  if (fields.playStyle !== undefined) updates.play_style = fields.playStyle;
  if (fields.privacyLevel !== undefined) updates.privacy_level = fields.privacyLevel;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    // 23514 = check_violation — the admin bypass above only skips the
    // app-layer name lock, not the profiles_verified_requires_name DB
    // constraint, so clearing a verified user's name without also
    // unverifying them still bounces here.
    if (error.code === '23514') return { ok: false, reason: 'verified_requires_name' };
    return { ok: false, reason: 'not_found' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  const user = toUser(data as UserRow);

  if (shouldAudit) {
    const { error: auditError } = await supabase.from('admin_user_edits').insert({
      target_user_id: id,
      performed_by: opts!.performedBy,
      changes: before ? buildUserChanges(fields, before, user) : null,
    });
    if (auditError) {
      console.error(`updateUser: audit insert failed for user ${id}`, auditError);
    }
  }

  return { ok: true, user };
}

export type SetVerifiedResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'name_required' };

// Fixed per technical-notes.md "Verification approval action" / brainstorm.md's
// "Rating locks and verification gates" — rating_floor is 6.0 ("advanced club
// level") regardless of which pro tier is granted, so this simple on/off
// toggle doesn't need a tier picker to satisfy the spec. PRO_VERIFIED_TIER
// (8) is just the minimum pro grade — the algorithm only ever checks
// `verified_tier !== null`, never which tier, so any value 8-10 behaves
// identically everywhere except this literal column value.
const PRO_VERIFIED_TIER = 8;
const PRO_RATING_FLOOR = 6.0;

// Admin+ only. A direct, immediate version of the (still unbuilt)
// `verification_requests` approve flow — skips evidence review, but writes
// the exact same columns the spec calls for. Enforces the name-required rule
// up front (`profiles_verified_requires_name` would otherwise reject the
// write with a raw constraint-violation error) rather than letting the DB
// constraint be the first line of defense. Never touches `internal_score`
// itself — the floor/ceiling this sets take effect the next time
// `computeRatingUpdate` runs, same as every other rating lock.
export async function setVerifiedStatus(
  callerId: string,
  targetUserId: string,
  verified: boolean,
): Promise<SetVerifiedResult> {
  const callerRole = await getAdminRole(callerId);
  if (!roleAtLeast(callerRole, 'admin')) return { ok: false, reason: 'forbidden' };

  const { data: currentRow, error: fetchError } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', targetUserId)
    .is('deleted_at', null)
    .single();
  if (fetchError || !currentRow) return { ok: false, reason: 'not_found' };

  const before = toUser(currentRow as UserRow);
  if (verified && (!before.firstName || !before.lastName)) {
    return { ok: false, reason: 'name_required' };
  }

  const updates = verified
    ? { verified_tier: PRO_VERIFIED_TIER, rating_floor: PRO_RATING_FLOOR }
    : { verified_tier: null, rating_floor: null };

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', targetUserId)
    .is('deleted_at', null)
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) return { ok: false, reason: 'not_found' };
  const user = toUser(data as UserRow);

  const changes: AdminHistoryFieldChange[] = (['verifiedTier', 'ratingFloor'] as const)
    .filter((field) => before[field] !== user[field])
    .map((field) => ({ field, before: before[field], after: user[field] }));

  const { error: auditError } = await supabase.from('admin_user_edits').insert({
    target_user_id: targetUserId,
    performed_by: callerId,
    changes: changes.length > 0 ? changes : null,
  });
  if (auditError) {
    console.error(`setVerifiedStatus: audit insert failed for user ${targetUserId}`, auditError);
  }

  return { ok: true, user };
}

export async function softDeleteUser(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  return !error;
}
