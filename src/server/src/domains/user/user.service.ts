import { supabase } from '../../lib/supabase.js';
import type { User } from '@pavilion/types';

type UserRow = {
  id: string;
  display_name: string;
  photo_url: string | null;
  city: string;
  region: string;
  preferred_formats: string[];
  play_style: string;
  privacy_level: string;
  verified_tier: number | null;
  rating_floor: number | null;
  reliability_score: number;
  session_count: number;
  created_at: string;
};

type UserUpdateFields = Partial<Pick<User,
  'displayName' | 'photoUrl' | 'city' | 'region' | 'preferredFormats' | 'playStyle' | 'privacyLevel'
>>;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
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
    .select('id, display_name, photo_url, city, region, preferred_formats, play_style, privacy_level, verified_tier, rating_floor, reliability_score, session_count, created_at')
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
    .select('id, display_name, photo_url, city, region, preferred_formats, play_style, privacy_level, verified_tier, rating_floor, reliability_score, session_count, created_at')
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
