import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

type VenueOverrides = Partial<{
  name: string;
  type: 'club' | 'rec_center' | 'community_center' | 'gym';
  lat: number;
  lng: number;
  dropInAvailable: boolean;
}>;

// Direct DB insert rather than going through the admin-create UI/API --
// mirrors session-fixtures.ts's createFixtureSession. `location` is written
// as the same EWKT literal venue.service.ts's createVenue uses
// (`SRID=4326;POINT(lng lat)`), so PostGIS parses the SRID correctly without
// going through the nearby_venues RPC's ST_SetSRID fix (that fix only
// matters for the *query* side, not this raw insert).
export async function createFixtureVenue(overrides: VenueOverrides = {}) {
  const {
    name = `E2E Venue ${randomUUID().slice(0, 8)}`,
    type = 'club',
    lat = 37.7749,
    lng = -122.4194,
    dropInAvailable = true,
  } = overrides;

  const { data, error } = await supabaseAdmin
    .from('venues')
    .insert({
      name,
      type,
      address: '1 Test St',
      city: 'Testville',
      region: 'CA',
      location: `SRID=4326;POINT(${lng} ${lat})`,
      court_count: 2,
      surface_type: 'wood',
      shuttle_type: 'feather',
      drop_in_available: dropInAvailable,
      reservation_required: false,
    })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(`fixture venue creation failed: ${error?.message}`);
  return data as { id: string; name: string };
}

export async function deleteFixtureVenue(id: string) {
  await supabaseAdmin.from('venues').delete().eq('id', id);
}
