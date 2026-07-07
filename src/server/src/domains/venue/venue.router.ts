import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import type { VenueType } from '@pavilion/types';
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

// Matches venue-filters.tsx's largest RADIUS_OPTIONS entry -- the client
// never sends more than this, so a larger value can only be a bad-faith or
// malformed request, not a legitimate radius the UI would ever produce.
const MAX_RADIUS_MILES = 100;

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
  const venue = await createVenue(c.get('userId'), body);
  if (!venue) return c.json({ error: 'Forbidden' }, 403);
  return c.json(venue, 201);
});

venueRouter.patch('/:id', auth, async (c) => {
  const body = await c.req.json();
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