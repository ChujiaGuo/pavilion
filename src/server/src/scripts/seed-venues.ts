// Seeds the local Supabase instance with a diverse spread of mock venues for
// manual/local testing of venue discovery (`/venues` listing, nearby search,
// the `/venues/[id]` detail page, and the VenuePicker used by session
// creation). Safe to re-run — it deletes and recreates everything it owns
// (matched by the "[SEED]" name prefix, same convention seed-sessions.ts
// uses for its own seed accounts) before inserting fresh data, rather than
// accumulating duplicates.
//
// seed-sessions.ts's sessions link to these venues by id and by these exact
// names, so run this script BEFORE seed-sessions.ts (or via `npm run
// seed:all`, which already orders it first) and re-run seed-sessions.ts
// afterward if you re-run this one standalone — this script's cleanup
// deletes any sessions pointed at the venues it's about to remove.
//
// Usage (from src/server): npm run seed:venues
//
// Requires `supabase start` running locally and src/server/.env.local
// populated (same prerequisites as `npm run dev`).
import { supabase } from '../lib/supabase.js';
import type { VenueType, SurfaceType, ShuttleType } from '@pavilion/types';

const SEED_PREFIX = '[SEED]';

interface SeedVenueSpec {
  name: string;
  type: VenueType;
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  courtCount: number;
  surfaceType: SurfaceType;
  shuttleType: ShuttleType;
  dropInAvailable: boolean;
  reservationRequired: boolean;
  contactPhone: string | null;
  contactWebsite: string | null;
  bookingUrl: string | null;
  // Mon–Sun open/close, in day_of_week order (0 = Sunday); null = closed that day.
  hours: ({ open: string; close: string } | null)[];
}

// Rockville/Bethesda/Silver Spring/Wheaton/Germantown MD coordinates cluster,
// matching the cities seed-sessions.ts already uses, so nearby-search testing
// has a realistic cluster to query against rather than points scattered
// across the globe (Fairfax, VA is the deliberate outlier below). Street
// addresses are all generic "Test Address N" placeholders — these are mock
// venues, not real locations, so there's no value in fabricating realistic
// street names. Playing conditions (court_count, surface_type, shuttle_type,
// drop_in_available, reservation_required) are deliberately varied across all
// ten so venue-diversity testing (filters, cards, detail page) has real
// spread to exercise rather than near-duplicate rows.
const VENUES: SeedVenueSpec[] = [
  {
    name: `${SEED_PREFIX} Rockville Badminton Club`,
    type: 'club',
    address: 'Test Address 1',
    city: 'Rockville',
    region: 'MD',
    lat: 39.0840,
    lng: -77.1528,
    courtCount: 8,
    surfaceType: 'synthetic_mat',
    shuttleType: 'feather',
    dropInAvailable: true,
    reservationRequired: false,
    contactPhone: '301-555-0101',
    contactWebsite: 'https://rockvillebadminton.example.test',
    bookingUrl: 'https://rockvillebadminton.example.test/book',
    hours: [
      { open: '09:00', close: '21:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '09:00', close: '21:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Bethesda Community Rec Center`,
    type: 'rec_center',
    address: 'Test Address 2',
    city: 'Bethesda',
    region: 'MD',
    lat: 38.9807,
    lng: -77.0947,
    courtCount: 4,
    surfaceType: 'wood',
    shuttleType: 'plastic',
    dropInAvailable: true,
    reservationRequired: true,
    contactPhone: '301-555-0102',
    contactWebsite: 'https://bethesdarec.example.test',
    bookingUrl: null,
    hours: [
      null,
      { open: '17:00', close: '21:00' },
      { open: '17:00', close: '21:00' },
      { open: '17:00', close: '21:00' },
      { open: '17:00', close: '21:00' },
      { open: '09:00', close: '17:00' },
      { open: '09:00', close: '17:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Twinbrook Community Center`,
    type: 'community_center',
    address: 'Test Address 3',
    city: 'Rockville',
    region: 'MD',
    lat: 39.0662,
    lng: -77.1042,
    courtCount: 2,
    surfaceType: 'concrete',
    shuttleType: 'both',
    dropInAvailable: true,
    reservationRequired: false,
    contactPhone: null,
    contactWebsite: null,
    bookingUrl: null,
    hours: [
      { open: '10:00', close: '18:00' },
      { open: '08:00', close: '20:00' },
      { open: '08:00', close: '20:00' },
      { open: '08:00', close: '20:00' },
      { open: '08:00', close: '20:00' },
      { open: '08:00', close: '20:00' },
      { open: '10:00', close: '18:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Pulse Fitness & Racquet Club`,
    type: 'gym',
    address: 'Test Address 4',
    city: 'Bethesda',
    region: 'MD',
    lat: 38.9847,
    lng: -77.0947,
    courtCount: 3,
    surfaceType: 'synthetic_mat',
    shuttleType: 'plastic',
    dropInAvailable: false,
    reservationRequired: true,
    contactPhone: '301-555-0103',
    contactWebsite: 'https://pulsefitness.example.test',
    bookingUrl: 'https://pulsefitness.example.test/reserve',
    hours: [
      { open: '07:00', close: '20:00' },
      { open: '05:00', close: '23:00' },
      { open: '05:00', close: '23:00' },
      { open: '05:00', close: '23:00' },
      { open: '05:00', close: '23:00' },
      { open: '05:00', close: '23:00' },
      { open: '07:00', close: '20:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Shady Grove Outdoor Courts`,
    type: 'community_center',
    address: 'Test Address 5',
    city: 'Rockville',
    region: 'MD',
    lat: 39.1090,
    lng: -77.1782,
    courtCount: 2,
    surfaceType: 'outdoor',
    shuttleType: 'plastic',
    dropInAvailable: true,
    reservationRequired: false,
    contactPhone: null,
    contactWebsite: null,
    bookingUrl: null,
    // Daylight-only, no reservation booth — same hours every day.
    hours: [
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
      { open: '08:00', close: '19:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Elite Smash Academy`,
    type: 'club',
    address: 'Test Address 6',
    city: 'Rockville',
    region: 'MD',
    lat: 39.0450,
    lng: -77.1180,
    courtCount: 6,
    surfaceType: 'wood',
    shuttleType: 'feather',
    dropInAvailable: false,
    reservationRequired: true,
    contactPhone: '301-555-0104',
    contactWebsite: 'https://elitesmash.example.test',
    bookingUrl: 'https://elitesmash.example.test/book',
    hours: [
      { open: '08:00', close: '22:00' },
      { open: '06:00', close: '23:00' },
      { open: '06:00', close: '23:00' },
      { open: '06:00', close: '23:00' },
      { open: '06:00', close: '23:00' },
      { open: '06:00', close: '23:00' },
      { open: '08:00', close: '22:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Far Out Fairfax Fieldhouse`,
    type: 'rec_center',
    address: 'Test Address 7',
    city: 'Fairfax',
    region: 'VA',
    // Well outside the Rockville/Bethesda cluster — for exercising the
    // nearby_venues radius filter's exclusion side (must not show up in a
    // small-radius search centered on Rockville/Bethesda).
    lat: 38.8462,
    lng: -77.3064,
    courtCount: 5,
    surfaceType: 'synthetic_mat',
    shuttleType: 'both',
    dropInAvailable: true,
    reservationRequired: false,
    contactPhone: '703-555-0105',
    contactWebsite: null,
    bookingUrl: null,
    hours: [
      { open: '09:00', close: '20:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '09:00', close: '20:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Silver Spring Shuttle House`,
    type: 'club',
    address: 'Test Address 8',
    city: 'Silver Spring',
    region: 'MD',
    lat: 38.9907,
    lng: -77.0261,
    courtCount: 4,
    surfaceType: 'wood',
    shuttleType: 'both',
    dropInAvailable: true,
    reservationRequired: true,
    contactPhone: '301-555-0106',
    contactWebsite: 'https://silverspringshuttle.example.test',
    bookingUrl: 'https://silverspringshuttle.example.test/book',
    hours: [
      { open: '08:00', close: '20:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '06:00', close: '22:00' },
      { open: '08:00', close: '20:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Wheaton Community Courts`,
    type: 'community_center',
    address: 'Test Address 9',
    city: 'Wheaton',
    region: 'MD',
    lat: 39.0396,
    lng: -77.0553,
    courtCount: 3,
    surfaceType: 'concrete',
    shuttleType: 'feather',
    dropInAvailable: true,
    reservationRequired: false,
    contactPhone: null,
    contactWebsite: null,
    bookingUrl: null,
    hours: [
      { open: '10:00', close: '19:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '07:00', close: '21:00' },
      { open: '10:00', close: '19:00' },
    ],
  },
  {
    name: `${SEED_PREFIX} Germantown Gym & Fitness`,
    type: 'gym',
    address: 'Test Address 10',
    city: 'Germantown',
    region: 'MD',
    lat: 39.1732,
    lng: -77.2717,
    // Smallest venue in the seed set — a single-court edge case for UI that
    // assumes multi-court venues.
    courtCount: 1,
    surfaceType: 'outdoor',
    shuttleType: 'plastic',
    dropInAvailable: false,
    reservationRequired: true,
    contactPhone: '301-555-0107',
    contactWebsite: 'https://germantowngym.example.test',
    bookingUrl: null,
    hours: [
      null,
      { open: '05:30', close: '22:00' },
      { open: '05:30', close: '22:00' },
      { open: '05:30', close: '22:00' },
      { open: '05:30', close: '22:00' },
      { open: '05:30', close: '22:00' },
      { open: '08:00', close: '18:00' },
    ],
  },
];

async function deleteExistingSeedData() {
  // venue_hours/venue_date_exceptions/venue_edit_suggestions/admin_venue_edits
  // all reference venues with ON DELETE CASCADE (see database-schema.md), so
  // those clear on their own. sessions.venue_id does NOT cascade (nullable
  // FK, no ON DELETE clause — see the initial-schema migration), so
  // seed-sessions.ts's sessions (which link to these venues by id) must be
  // deleted first or this delete fails with a FK violation. Same story one
  // level deeper: admin_session_edits.session_id also has no cascade, so any
  // audit row logged against one of these sessions (e.g. from exercising the
  // admin sessions panel) must be cleared before the session delete too.
  const { data: existing, error: selectError } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', `${SEED_PREFIX}%`);
  if (selectError) throw selectError;
  if (!existing || existing.length === 0) return;

  const venueIds = existing.map((v) => v.id);

  const { data: linkedSessions, error: sessionSelectError } = await supabase
    .from('sessions')
    .select('id')
    .in('venue_id', venueIds);
  if (sessionSelectError) throw sessionSelectError;

  if (linkedSessions && linkedSessions.length > 0) {
    const sessionIds = linkedSessions.map((s) => s.id);
    const { error: deleteAuditError } = await supabase.from('admin_session_edits').delete().in('session_id', sessionIds);
    if (deleteAuditError) throw deleteAuditError;
  }

  const { error: deleteSessionsError } = await supabase.from('sessions').delete().in('venue_id', venueIds);
  if (deleteSessionsError) throw deleteSessionsError;

  const { error: deleteError } = await supabase.from('venues').delete().in('id', venueIds);
  if (deleteError) throw deleteError;

  console.log(`Cleaned up ${existing.length} existing seed venue(s) and any sessions linked to them.`);
}

async function createVenues() {
  for (const spec of VENUES) {
    const { data: venue, error } = await supabase
      .from('venues')
      .insert({
        name: spec.name,
        type: spec.type,
        address: spec.address,
        city: spec.city,
        region: spec.region,
        // Same EWKT literal format venue.service.ts's createVenue writes
        // (SRID=4326;POINT(lng lat)) -- see technical-notes.md's "Session &
        // Venue" PostGIS gotcha note.
        location: `SRID=4326;POINT(${spec.lng} ${spec.lat})`,
        court_count: spec.courtCount,
        surface_type: spec.surfaceType,
        shuttle_type: spec.shuttleType,
        drop_in_available: spec.dropInAvailable,
        reservation_required: spec.reservationRequired,
        contact_phone: spec.contactPhone,
        contact_website: spec.contactWebsite,
        booking_url: spec.bookingUrl,
      })
      .select('id')
      .single();
    if (error || !venue) throw new Error(`Failed to create venue "${spec.name}": ${error?.message}`);

    const hourRows = spec.hours
      .map((h, dayOfWeek) => (h ? { venue_id: venue.id, day_of_week: dayOfWeek, open_time: h.open, close_time: h.close } : null))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (hourRows.length > 0) {
      const { error: hoursError } = await supabase.from('venue_hours').insert(hourRows);
      if (hoursError) throw new Error(`Failed to seed hours for "${spec.name}": ${hoursError.message}`);
    }

    console.log(`Created: ${spec.name} (${spec.city}, ${spec.region})`);
  }
}

async function main() {
  console.log('Cleaning up any previous run...');
  await deleteExistingSeedData();

  console.log('Creating venues + hours...');
  await createVenues();

  console.log(`\nDone. ${VENUES.length} venues seeded (all "${SEED_PREFIX}"-prefixed names).`);
  console.log('Browse them at http://localhost:3000/venues');
}

main()
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
