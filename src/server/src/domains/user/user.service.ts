import { supabase } from '../../lib/supabase.js';
import type { User } from '@pavilion/types';

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

export async function updateUser(id: string, fields: UserUpdateFields): Promise<User | null> {
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

  if (error || !data) return null;
  return toUser(data as UserRow);
}

export async function softDeleteUser(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  return !error;
}
