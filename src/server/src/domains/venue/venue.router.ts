import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { VenueType, SurfaceType, ShuttleType } from '@pavilion/types';
import {
  getVenueById,
  listVenues,
  createVenue,
  updateVenue,
  claimVenue,
  submitEditSuggestion,
} from './venue.service.js';
import { autocompleteAddress, getPlaceDetails } from './venue.places.js';

export const venueRouter = new Hono<{ Variables: { userId: string } }>();

const VENUE_TYPES: VenueType[] = ['club', 'rec_center', 'community_center', 'gym'];
const SURFACE_TYPES: SurfaceType[] = ['synthetic_mat', 'wood', 'concrete', 'outdoor'];
const SHUTTLE_TYPES: ShuttleType[] = ['feather', 'plastic', 'both'];

// Matches venue-filters.tsx's largest RADIUS_OPTIONS entry -- the client
// never sends more than this, so a larger value can only be a bad-faith or
// malformed request, not a legitimate radius the UI would ever produce.
const MAX_RADIUS_MILES = 100;

// HTML <input type="time"> sends "HH:MM"; "HH:MM:SS" (Postgres's own display
// format) is also accepted since that's what a round-tripped edit would show.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const EDITABLE_VENUE_FIELDS = new Set([
  'name',
  'type',
  'address',
  'city',
  'region',
  'courtCount',
  'surfaceType',
  'shuttleType',
  'dropInAvailable',
  'reservationRequired',
  'contactPhone',
  'contactWebsite',
  'bookingUrl',
]);

// Validates whichever of these fields are present -- shared by POST / and
// PATCH /:id so a PATCH partial body gets the same protection as create
// (session.router.ts's validateSessionFieldValues follows the same
// pattern). The venues table only enforces NOT NULL at the DB level (see
// database-schema.md), which still lets an empty string, a zero court
// count, or an unrecognized enum value through -- this is the actual
// "required" gate.
function validateVenueFieldValues(fields: {
  name?: unknown;
  type?: unknown;
  address?: unknown;
  city?: unknown;
  region?: unknown;
  lat?: unknown;
  lng?: unknown;
  courtCount?: unknown;
  surfaceType?: unknown;
  shuttleType?: unknown;
  dropInAvailable?: unknown;
  reservationRequired?: unknown;
  contactPhone?: unknown;
  contactWebsite?: unknown;
  bookingUrl?: unknown;
  hours?: unknown;
}): string | null {
  if (fields.name !== undefined && (typeof fields.name !== 'string' || fields.name.trim() === '')) {
    return 'name must be a non-empty string';
  }
  if (fields.type !== undefined && !VENUE_TYPES.includes(fields.type as VenueType)) {
    return 'Invalid type';
  }
  if (fields.address !== undefined && (typeof fields.address !== 'string' || fields.address.trim() === '')) {
    return 'address must be a non-empty string';
  }
  if (fields.city !== undefined && (typeof fields.city !== 'string' || fields.city.trim() === '')) {
    return 'city must be a non-empty string';
  }
  if (fields.region !== undefined && (typeof fields.region !== 'string' || fields.region.trim() === '')) {
    return 'region must be a non-empty string';
  }
  if (fields.lat !== undefined) {
    const n = Number(fields.lat);
    if (!Number.isFinite(n) || n < -90 || n > 90) return 'lat must be a number between -90 and 90';
  }
  if (fields.lng !== undefined) {
    const n = Number(fields.lng);
    if (!Number.isFinite(n) || n < -180 || n > 180) return 'lng must be a number between -180 and 180';
  }
  if (
    fields.courtCount !== undefined &&
    (!Number.isFinite(Number(fields.courtCount)) || Number(fields.courtCount) < 1)
  ) {
    return 'courtCount must be at least 1';
  }
  if (fields.surfaceType !== undefined && !SURFACE_TYPES.includes(fields.surfaceType as SurfaceType)) {
    return 'Invalid surfaceType';
  }
  if (fields.shuttleType !== undefined && !SHUTTLE_TYPES.includes(fields.shuttleType as ShuttleType)) {
    return 'Invalid shuttleType';
  }
  if (fields.dropInAvailable !== undefined && typeof fields.dropInAvailable !== 'boolean') {
    return 'dropInAvailable must be a boolean';
  }
  if (fields.reservationRequired !== undefined && typeof fields.reservationRequired !== 'boolean') {
    return 'reservationRequired must be a boolean';
  }
  if (
    fields.contactPhone !== undefined && fields.contactPhone !== null && typeof fields.contactPhone !== 'string'
  ) {
    return 'contactPhone must be a string or null';
  }
  if (
    fields.contactWebsite !== undefined && fields.contactWebsite !== null &&
    typeof fields.contactWebsite !== 'string'
  ) {
    return 'contactWebsite must be a string or null';
  }
  if (fields.bookingUrl !== undefined && fields.bookingUrl !== null && typeof fields.bookingUrl !== 'string') {
    return 'bookingUrl must be a string or null';
  }
  if (fields.hours !== undefined) {
    if (!Array.isArray(fields.hours)) return 'hours must be an array';
    const seenDays = new Set<number>();
    for (const entry of fields.hours as unknown[]) {
      if (typeof entry !== 'object' || entry === null) return 'Each hours entry must be an object';
      const { dayOfWeek, openTime, closeTime } = entry as Record<string, unknown>;
      if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return 'hours.dayOfWeek must be an integer between 0 and 6';
      }
      if (seenDays.has(dayOfWeek)) return 'hours cannot contain more than one entry for the same dayOfWeek';
      seenDays.add(dayOfWeek);
      if (typeof openTime !== 'string' || !TIME_RE.test(openTime)) {
        return 'hours.openTime must be a time string in HH:MM format';
      }
      if (typeof closeTime !== 'string' || !TIME_RE.test(closeTime)) {
        return 'hours.closeTime must be a time string in HH:MM format';
      }
    }
  }
  return null;
}

venueRouter.get('/', async (c) => {
  const { name, city, type, drop_in, lat, lng, radius_miles } = c.req.query();
  if (type !== undefined && !VENUE_TYPES.includes(type as VenueType)) {
    return c.json({ error: 'Invalid type' }, 400);
  }

  // All three (lat/lng/radius_miles) are required together to activate the
  // distance-search path -- a partial set is treated as absent rather than
  // guessing a default for the missing piece.
  let near: { lat: number; lng: number; radiusMiles: number } | undefined;
  if (lat !== undefined || lng !== undefined || radius_miles !== undefined) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const parsedRadius = Number(radius_miles);
    if (
      lat === undefined || lng === undefined || radius_miles === undefined ||
      Number.isNaN(parsedLat) || Number.isNaN(parsedLng) || Number.isNaN(parsedRadius)
    ) {
      return c.json({ error: 'lat, lng, and radius_miles must all be provided as numbers' }, 400);
    }
    // Bounds-check before these reach ST_MakePoint/ST_DWithin -- out-of-range
    // coordinates would silently produce a nonsensical (but not erroring)
    // geography point, and an unbounded radius would defeat the point of a
    // radius filter (and the row cap below, since it's paired with an
    // ORDER BY distance that only makes sense with a bounded search area).
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return c.json({ error: 'lat must be between -90 and 90, and lng between -180 and 180' }, 400);
    }
    if (parsedRadius <= 0 || parsedRadius > MAX_RADIUS_MILES) {
      return c.json({ error: `radius_miles must be greater than 0 and at most ${MAX_RADIUS_MILES}` }, 400);
    }
    near = { lat: parsedLat, lng: parsedLng, radiusMiles: parsedRadius };
  }

  const venues = await listVenues({
    name: name || undefined,
    city: city || undefined,
    type: type as VenueType | undefined,
    dropInAvailable: drop_in !== undefined ? drop_in === 'true' : undefined,
    near,
  });
  return c.json({ venues });
});

// Admin-only proxy to Google's Places API (New) -- used by the admin
// venue-creation address field only (see technical-notes.md). Gated
// venue_verifier+, same rank as createVenue/updateVenue's admin branch,
// since these calls cost real money per request even though they don't
// write anything themselves.
venueRouter.get('/places/autocomplete', auth, async (c) => {
  if (!roleAtLeast(await getAdminRole(c.get('userId')), 'venue_verifier')) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const { input, sessiontoken } = c.req.query();
  if (!input || !sessiontoken) return c.json({ error: 'input and sessiontoken are required' }, 400);
  const result = await autocompleteAddress(input, sessiontoken);
  return c.json(result);
});

venueRouter.get('/places/details', auth, async (c) => {
  if (!roleAtLeast(await getAdminRole(c.get('userId')), 'venue_verifier')) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const { placeId, sessiontoken } = c.req.query();
  if (!placeId || !sessiontoken) return c.json({ error: 'placeId and sessiontoken are required' }, 400);
  const result = await getPlaceDetails(placeId, sessiontoken);
  return c.json(result);
});

venueRouter.get('/:id', async (c) => {
  const venue = await getVenueById(c.req.param('id'));
  if (!venue) return c.json({ error: 'Not found' }, 404);
  return c.json(venue);
});

venueRouter.post('/', auth, async (c) => {
  const body = await c.req.json();
  const { name, type, address, city, region, lat, lng, courtCount, surfaceType, shuttleType } =
    body as Record<string, unknown>;

  if (
    !name || !type || !address || !city || !region ||
    lat === undefined || lng === undefined || !courtCount || !surfaceType || !shuttleType
  ) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const validationError = validateVenueFieldValues(body as Record<string, unknown>);
  if (validationError) return c.json({ error: validationError }, 400);

  const venue = await createVenue(c.get('userId'), body);
  if (!venue) return c.json({ error: 'Forbidden' }, 403);
  return c.json(venue, 201);
});

venueRouter.patch('/:id', auth, async (c) => {
  const body = await c.req.json();

  const validationError = validateVenueFieldValues(body as Record<string, unknown>);
  if (validationError) return c.json({ error: validationError }, 400);

  const venue = await updateVenue(c.req.param('id'), c.get('userId'), body);
  if (!venue) return c.json({ error: 'Not found or forbidden' }, 404);
  return c.json(venue);
});

venueRouter.post('/:id/claim', auth, async (c) => {
  const venue = await claimVenue(c.req.param('id'), c.get('userId'));
  if (!venue) return c.json({ error: 'Not found or already claimed' }, 409);
  return c.json(venue);
});

venueRouter.post('/:id/suggest-edit', auth, async (c) => {
  const body = await c.req.json();
  const { fieldName, suggestedValue } = body;
  if (!fieldName || suggestedValue === undefined) {
    return c.json({ error: 'fieldName and suggestedValue are required' }, 400);
  }
  if (!EDITABLE_VENUE_FIELDS.has(fieldName)) {
    return c.json({ error: 'Invalid fieldName' }, 400);
  }
  const ok = await submitEditSuggestion(c.req.param('id'), c.get('userId'), fieldName, suggestedValue);
  if (!ok) return c.json({ error: 'Failed to submit suggestion' }, 500);
  return c.json({ success: true });
});