import { supabase } from '../../lib/supabase.js';
import type { Venue, VenueHours } from '@pavilion/types';

type VenueRow = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  region: string;
  location: { coordinates: [number, number] };
  court_count: number;
  surface_type: string;
  shuttle_type: string;
  drop_in_available: boolean;
  reservation_required: boolean;
  contact_phone: string | null;
  contact_website: string | null;
  booking_url: string | null;
  claimed_by_account_id: string | null;
  created_at: string;
  venue_hours: { day_of_week: number; open_time: string; close_time: string }[];
};

export type VenueCreateFields = {
  name: string;
  type: Venue['type'];
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  courtCount: number;
  surfaceType: Venue['surfaceType'];
  shuttleType: Venue['shuttleType'];
  dropInAvailable: boolean;
  reservationRequired: boolean;
  contactPhone?: string | null;
  contactWebsite?: string | null;
  bookingUrl?: string | null;
};

export type VenueUpdateFields = Partial<Omit<VenueCreateFields, 'lat' | 'lng'>>;

export type VenueListFilters = {
  city?: string;
  type?: Venue['type'];
  dropInAvailable?: boolean;
};

function toVenue(row: VenueRow): Venue {
  const [lng, lat] = row.location.coordinates;
  return {
    id: row.id,
    name: row.name,
    type: row.type as Venue['type'],
    address: row.address,
    city: row.city,
    region: row.region,
    lat,
    lng,
    courtCount: row.court_count,
    surfaceType: row.surface_type as Venue['surfaceType'],
    shuttleType: row.shuttle_type as Venue['shuttleType'],
    dropInAvailable: row.drop_in_available,
    reservationRequired: row.reservation_required,
    contactPhone: row.contact_phone,
    contactWebsite: row.contact_website,
    bookingUrl: row.booking_url,
    hours: (row.venue_hours ?? []).map((h) => ({
      dayOfWeek: h.day_of_week as VenueHours['dayOfWeek'],
      openTime: h.open_time,
      closeTime: h.close_time,
    })),
    claimedByAccountId: row.claimed_by_account_id,
    createdAt: row.created_at,
  };
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  return !!data;
}

const VENUE_SELECT = '*, venue_hours(day_of_week, open_time, close_time)';

export async function getVenueById(id: string): Promise<Venue | null> {
  const { data, error } = await supabase
    .from('venues')
    .select(VENUE_SELECT)
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return toVenue(data as VenueRow);
}

export async function listVenues(filters: VenueListFilters = {}): Promise<Venue[]> {
  let query = supabase.from('venues').select(VENUE_SELECT);

  if (filters.city) query = query.eq('city', filters.city);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.dropInAvailable !== undefined) query = query.eq('drop_in_available', filters.dropInAvailable);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as VenueRow[]).map(toVenue);
}

export async function createVenue(userId: string, fields: VenueCreateFields): Promise<Venue | null> {
  if (!await isAdmin(userId)) return null;

  const { data, error } = await supabase
    .from('venues')
    .insert({
      name: fields.name,
      type: fields.type,
      address: fields.address,
      city: fields.city,
      region: fields.region,
      location: `SRID=4326;POINT(${fields.lng} ${fields.lat})`,
      court_count: fields.courtCount,
      surface_type: fields.surfaceType,
      shuttle_type: fields.shuttleType,
      drop_in_available: fields.dropInAvailable,
      reservation_required: fields.reservationRequired,
      contact_phone: fields.contactPhone ?? null,
      contact_website: fields.contactWebsite ?? null,
      booking_url: fields.bookingUrl ?? null,
    })
    .select(VENUE_SELECT)
    .single();

  if (error || !data) return null;
  return toVenue(data as VenueRow);
}

export async function updateVenue(
  id: string,
  userId: string,
  fields: VenueUpdateFields,
): Promise<Venue | null> {
  const admin = await isAdmin(userId);
  if (!admin) {
    const { data: existing } = await supabase
      .from('venues')
      .select('claimed_by_account_id')
      .eq('id', id)
      .single();
    if (!existing || existing.claimed_by_account_id !== userId) return null;
  }

  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.type !== undefined) updates.type = fields.type;
  if (fields.address !== undefined) updates.address = fields.address;
  if (fields.city !== undefined) updates.city = fields.city;
  if (fields.region !== undefined) updates.region = fields.region;
  if (fields.courtCount !== undefined) updates.court_count = fields.courtCount;
  if (fields.surfaceType !== undefined) updates.surface_type = fields.surfaceType;
  if (fields.shuttleType !== undefined) updates.shuttle_type = fields.shuttleType;
  if (fields.dropInAvailable !== undefined) updates.drop_in_available = fields.dropInAvailable;
  if (fields.reservationRequired !== undefined) updates.reservation_required = fields.reservationRequired;
  if (fields.contactPhone !== undefined) updates.contact_phone = fields.contactPhone;
  if (fields.contactWebsite !== undefined) updates.contact_website = fields.contactWebsite;
  if (fields.bookingUrl !== undefined) updates.booking_url = fields.bookingUrl;

  const { data, error } = await supabase
    .from('venues')
    .update(updates)
    .eq('id', id)
    .select(VENUE_SELECT)
    .single();

  if (error || !data) return null;
  return toVenue(data as VenueRow);
}

export async function claimVenue(id: string, userId: string): Promise<Venue | null> {
  const { data: existing } = await supabase
    .from('venues')
    .select('claimed_by_account_id')
    .eq('id', id)
    .single();

  if (!existing || existing.claimed_by_account_id !== null) return null;

  const { data, error } = await supabase
    .from('venues')
    .update({ claimed_by_account_id: userId })
    .eq('id', id)
    .select(VENUE_SELECT)
    .single();

  if (error || !data) return null;
  return toVenue(data as VenueRow);
}

export async function submitEditSuggestion(
  venueId: string,
  userId: string,
  fieldName: string,
  suggestedValue: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('venue_edit_suggestions')
    .insert({
      venue_id: venueId,
      submitted_by: userId,
      field_name: fieldName,
      suggested_value: suggestedValue,
    });

  return !error;
}
