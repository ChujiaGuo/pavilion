import { supabase } from '../../lib/supabase.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { AdminHistoryFieldChange, Venue, VenueHours } from '@pavilion/types';

type VenueRow = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  region: string;
  lng: number;
  lat: number;
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

// Shape returned by the nearby_venues RPC (see the migration of the same
// name) — every venues column plus a computed distance_meters, and no
// venue_hours embed (PostgREST RPC results aren't relational embeds the way
// a plain table select is, and the listing view this backs doesn't need
// per-day hours anyway — see venue.service.ts's listVenues).
type NearbyVenueRow = Omit<VenueRow, 'venue_hours'> & { distance_meters: number };

const METERS_PER_MILE = 1609.34;

// Same 50-row cap already used for other unpaginated searches
// (session.service.ts's ADMIN_SEARCH_LIMIT, user.service.ts's
// SEARCH_RESULT_LIMIT) -- nearby_venues has no pagination UI in v1, so an
// unbounded radius (up to MAX_RADIUS_MILES in venue.router.ts) shouldn't be
// able to pull back an unbounded row count.
const NEARBY_VENUES_LIMIT = 50;

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
  name?: string;
  city?: string;
  type?: Venue['type'];
  dropInAvailable?: boolean;
  // Activates the nearby_venues RPC path instead of the plain filtered
  // select — see listVenues below. city is still accepted above but isn't
  // combined with near-search: a radius is already more precise than a city
  // match, so when both are present near wins and city is ignored.
  near?: { lat: number; lng: number; radiusMiles: number };
};

function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Venue['type'],
    address: row.address,
    city: row.city,
    region: row.region,
    lat: row.lat,
    lng: row.lng,
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

function toVenueWithDistance(row: NearbyVenueRow): Venue {
  return {
    ...toVenue({ ...row, venue_hours: [] }),
    distanceMiles: row.distance_meters / METERS_PER_MILE,
  };
}

// venue_verifier is the lowest role in the hierarchy, so "has any admins row"
// and "is venue_verifier or higher" are equivalent — this just routes that
// check through the shared role-rank helper (lib/admin.ts) instead of a
// second ad hoc admins-table query, so there's one source of truth for the
// role hierarchy. No behavior change.
async function isAdmin(userId: string): Promise<boolean> {
  return roleAtLeast(await getAdminRole(userId), 'venue_verifier');
}

async function logVenueEdit(
  venueId: string,
  performedBy: string,
  action: string,
  changes: AdminHistoryFieldChange[] | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('admin_venue_edits')
    .insert({ venue_id: venueId, performed_by: performedBy, action, changes });
  if (error) {
    console.error(`logVenueEdit: audit insert failed for venue ${venueId} (${action})`, error);
  }
}

// Only fields that are both present in the patch AND actually differ from
// their prior value are diffed — an edit form resubmits every field on save
// (not just the ones touched), so comparing presence alone would pad every
// entry with no-op "X -> X" pairs for untouched fields.
function buildVenueChanges(fields: VenueUpdateFields, before: Venue, after: Venue): AdminHistoryFieldChange[] {
  return (Object.keys(fields) as (keyof VenueUpdateFields)[])
    .filter((key) => fields[key] !== undefined && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ field: key, before: before[key], after: after[key] }));
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
  if (filters.near) {
    const { data, error } = await supabase
      .rpc('nearby_venues', {
        p_lat: filters.near.lat,
        p_lng: filters.near.lng,
        p_radius_meters: filters.near.radiusMiles * METERS_PER_MILE,
        p_name: filters.name ?? null,
        p_type: filters.type ?? null,
        p_drop_in: filters.dropInAvailable ?? null,
      })
      .limit(NEARBY_VENUES_LIMIT);
    if (error || !data) return [];
    return (data as NearbyVenueRow[]).map(toVenueWithDistance);
  }

  let query = supabase.from('venues').select(VENUE_SELECT);

  if (filters.name) query = query.ilike('name', `%${filters.name}%`);
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

  await logVenueEdit(data.id, userId, 'create');

  return toVenue(data as VenueRow);
}

export async function updateVenue(
  id: string,
  userId: string,
  fields: VenueUpdateFields,
): Promise<Venue | null> {
  const admin = await isAdmin(userId);

  // Only fetched on the admin-override path — captures "before" values for
  // the History diff. Skipped on the claimed-owner path, so an ordinary
  // owner edit doesn't pay for an extra read.
  let before: Venue | null = null;
  if (admin) {
    const { data: currentRow } = await supabase.from('venues').select(VENUE_SELECT).eq('id', id).single();
    if (currentRow) before = toVenue(currentRow as VenueRow);
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

  let query = supabase.from('venues').update(updates).eq('id', id);
  if (!admin) query = query.eq('claimed_by_account_id', userId);

  const { data, error } = await query.select(VENUE_SELECT).single();

  if (error || !data) return null;
  const venue = toVenue(data as VenueRow);

  if (admin) {
    await logVenueEdit(id, userId, 'edit', before ? buildVenueChanges(fields, before, venue) : null);
  }

  return venue;
}

export async function claimVenue(id: string, userId: string): Promise<Venue | null> {
  const { data, error } = await supabase
    .from('venues')
    .update({ claimed_by_account_id: userId })
    .eq('id', id)
    .is('claimed_by_account_id', null)
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
