-- Distance-based venue search, backing GET /api/venues?lat=&lng=&radius_miles=
-- (venue.service.ts's listVenues). ST_MakePoint produces a geometry with SRID 0 --
-- casting that directly to geography fails/misbehaves since geography requires a
-- defined coordinate system. ST_SetSRID(..., 4326) before the ::geography cast
-- matches the venues.location column's own geography(Point, 4326) type and the
-- SRID=4326;POINT(...) literal createVenue already writes.
CREATE OR REPLACE FUNCTION nearby_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision,
  p_name text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_drop_in boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  address text,
  city text,
  region text,
  lng double precision,
  lat double precision,
  court_count integer,
  surface_type text,
  shuttle_type text,
  drop_in_available boolean,
  reservation_required boolean,
  contact_phone text,
  contact_website text,
  booking_url text,
  claimed_by_account_id uuid,
  created_at timestamptz,
  distance_meters double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id, v.name, v.type, v.address, v.city, v.region, v.lng, v.lat,
    v.court_count, v.surface_type, v.shuttle_type, v.drop_in_available,
    v.reservation_required, v.contact_phone, v.contact_website, v.booking_url,
    v.claimed_by_account_id, v.created_at,
    ST_Distance(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_meters
  FROM venues v
  WHERE ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_meters)
    AND (p_name IS NULL OR v.name ILIKE '%' || p_name || '%')
    AND (p_type IS NULL OR v.type = p_type)
    AND (p_drop_in IS NULL OR v.drop_in_available = p_drop_in)
  ORDER BY distance_meters ASC;
$$;

-- Postgres grants EXECUTE on a newly created function to PUBLIC by default, and
-- config.toml exposes the public schema over PostgREST -- so without this, an
-- un-revoked function is callable via /rest/v1/rpc/nearby_venues with just the
-- anon key. Venue data itself isn't sensitive, but this locks it down anyway for
-- consistency with every other RPC in this codebase (see
-- 20260701142827_lock_down_session_rpcs.sql) -- only the server's service-role
-- client should call it.
REVOKE EXECUTE ON FUNCTION nearby_venues(double precision, double precision, double precision, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nearby_venues(double precision, double precision, double precision, text, text, boolean) TO service_role;
