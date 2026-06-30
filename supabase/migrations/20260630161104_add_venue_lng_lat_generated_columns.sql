-- PostgREST returns geography(Point,4326) columns as a hex-encoded EWKB
-- string, not the { coordinates: [lng, lat] } shape venue.service.ts assumed
-- (confirmed against a live instance — toVenue() crashed on every real row).
-- Generated columns sidestep parsing PostGIS's wire format in app code: the
-- decode happens once, in Postgres, at write time.
ALTER TABLE venues
  ADD COLUMN lng double precision GENERATED ALWAYS AS (ST_X(location::geometry)) STORED,
  ADD COLUMN lat double precision GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED;