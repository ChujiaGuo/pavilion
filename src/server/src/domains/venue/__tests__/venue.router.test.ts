import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

// Mock the service so router tests only verify HTTP behavior,
// not the multi-step DB logic already covered in venue.service.test.ts.
vi.mock('../venue.service.js', () => ({
  getVenueById: vi.fn(),
  listVenues: vi.fn(),
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  claimVenue: vi.fn(),
  submitEditSuggestion: vi.fn(),
}));

vi.mock('../venue.places.js', () => ({
  autocompleteAddress: vi.fn(),
  getPlaceDetails: vi.fn(),
}));

vi.mock('../../../lib/admin.js', () => ({
  getAdminRole: vi.fn(),
  roleAtLeast: vi.fn(),
}));

import { supabase } from '../../../lib/supabase.js';
import {
  getVenueById,
  listVenues,
  createVenue,
  updateVenue,
  claimVenue,
  submitEditSuggestion,
} from '../venue.service.js';
import { autocompleteAddress, getPlaceDetails } from '../venue.places.js';
import { getAdminRole, roleAtLeast } from '../../../lib/admin.js';
import { venueRouter } from '../venue.router.js';

const mockGetUser = vi.mocked(supabase.auth.getUser);
const mockGetVenueById = vi.mocked(getVenueById);
const mockListVenues = vi.mocked(listVenues);
const mockCreateVenue = vi.mocked(createVenue);
const mockUpdateVenue = vi.mocked(updateVenue);
const mockClaimVenue = vi.mocked(claimVenue);
const mockSubmitEditSuggestion = vi.mocked(submitEditSuggestion);
const mockAutocompleteAddress = vi.mocked(autocompleteAddress);
const mockGetPlaceDetails = vi.mocked(getPlaceDetails);
const mockGetAdminRole = vi.mocked(getAdminRole);
const mockRoleAtLeast = vi.mocked(roleAtLeast);

const VENUE_ID = 'venue-1';
const USER_ID = 'user-1';

const VENUE = {
  id: VENUE_ID,
  name: 'Badminton Hub',
  type: 'club',
  address: '123 Main St',
  city: 'Vancouver',
  region: 'BC',
  lat: 49.2827,
  lng: -123.1207,
  courtCount: 4,
  surfaceType: 'synthetic_mat',
  shuttleType: 'feather',
  dropInAvailable: true,
  reservationRequired: false,
  contactPhone: null,
  contactWebsite: null,
  bookingUrl: null,
  hours: [],
  claimedByAccountId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

function withAuth(asUserId = USER_ID): Record<string, string> {
  mockGetUser.mockResolvedValue({
    data: { user: { id: asUserId } },
    error: null,
  } as any);
  return { Authorization: 'Bearer mock-token' };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns 200 with a venues array', async () => {
    mockListVenues.mockResolvedValue([VENUE] as any);
    const res = await venueRouter.request('/');
    expect(res.status).toBe(200);
    expect((await res.json()).venues).toHaveLength(1);
  });

  it('does not require an Authorization header', async () => {
    mockListVenues.mockResolvedValue([]);
    const res = await venueRouter.request('/');
    expect(res.status).toBe(200);
  });

  it('passes the city query param to listVenues', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?city=Vancouver');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Vancouver' })
    );
  });

  it('converts drop_in=true to boolean true', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?drop_in=true');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ dropInAvailable: true })
    );
  });

  it('converts drop_in=false to boolean false', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?drop_in=false');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ dropInAvailable: false })
    );
  });

  it('passes dropInAvailable as undefined when drop_in param is absent', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ dropInAvailable: undefined })
    );
  });

  it('passes a valid type query param through to listVenues', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?type=club');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'club' })
    );
  });

  it('returns 400 for an invalid type query param without calling listVenues', async () => {
    const res = await venueRouter.request('/?type=arbitrary_string');
    expect(res.status).toBe(400);
    expect(mockListVenues).not.toHaveBeenCalled();
  });

  it('passes the name query param through to listVenues', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?name=Riverside');
    expect(mockListVenues).toHaveBeenCalledWith(expect.objectContaining({ name: 'Riverside' }));
  });

  it('activates near when lat/lng/radius_miles are all present', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/?lat=49.28&lng=-123.12&radius_miles=25');
    expect(mockListVenues).toHaveBeenCalledWith(
      expect.objectContaining({ near: { lat: 49.28, lng: -123.12, radiusMiles: 25 } })
    );
  });

  it('returns 400 when only some of lat/lng/radius_miles are provided', async () => {
    const res = await venueRouter.request('/?lat=49.28&lng=-123.12');
    expect(res.status).toBe(400);
    expect(mockListVenues).not.toHaveBeenCalled();
  });

  it('returns 400 when lat is not a number', async () => {
    const res = await venueRouter.request('/?lat=notanumber&lng=-123.12&radius_miles=25');
    expect(res.status).toBe(400);
    expect(mockListVenues).not.toHaveBeenCalled();
  });

  it('leaves near undefined when none of lat/lng/radius_miles are provided', async () => {
    mockListVenues.mockResolvedValue([]);
    await venueRouter.request('/');
    expect(mockListVenues).toHaveBeenCalledWith(expect.objectContaining({ near: undefined }));
  });

  it.each([
    ['lat above 90', 'lat=90.1&lng=-123.12&radius_miles=25'],
    ['lat below -90', 'lat=-90.1&lng=-123.12&radius_miles=25'],
    ['lng above 180', 'lat=49.28&lng=180.1&radius_miles=25'],
    ['lng below -180', 'lat=49.28&lng=-180.1&radius_miles=25'],
    ['radius_miles of 0', 'lat=49.28&lng=-123.12&radius_miles=0'],
    ['radius_miles negative', 'lat=49.28&lng=-123.12&radius_miles=-5'],
    ['radius_miles above the 100mi max', 'lat=49.28&lng=-123.12&radius_miles=101'],
  ])('returns 400 for %s, without calling listVenues', async (_label, qs) => {
    const res = await venueRouter.request(`/?${qs}`);
    expect(res.status).toBe(400);
    expect(mockListVenues).not.toHaveBeenCalled();
  });

  it.each([
    ['lat at the 90 boundary', 'lat=90&lng=-123.12&radius_miles=25'],
    ['lat at the -90 boundary', 'lat=-90&lng=-123.12&radius_miles=25'],
    ['lng at the 180 boundary', 'lat=49.28&lng=180&radius_miles=25'],
    ['radius_miles at the 100mi max', 'lat=49.28&lng=-123.12&radius_miles=100'],
  ])('accepts %s', async (_label, qs) => {
    mockListVenues.mockResolvedValue([]);
    const res = await venueRouter.request(`/?${qs}`);
    expect(res.status).toBe(200);
    expect(mockListVenues).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /places/autocomplete
// ---------------------------------------------------------------------------

describe('GET /places/autocomplete', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request('/places/autocomplete?input=123+Main&sessiontoken=tok');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is below venue_verifier', async () => {
    mockGetAdminRole.mockResolvedValue(null);
    mockRoleAtLeast.mockReturnValue(false);
    const res = await venueRouter.request('/places/autocomplete?input=123+Main&sessiontoken=tok', {
      headers: withAuth(),
    });
    expect(res.status).toBe(403);
    expect(mockAutocompleteAddress).not.toHaveBeenCalled();
  });

  it('returns 400 when input or sessiontoken is missing', async () => {
    mockGetAdminRole.mockResolvedValue('venue_verifier');
    mockRoleAtLeast.mockReturnValue(true);
    const res = await venueRouter.request('/places/autocomplete?input=123+Main', { headers: withAuth() });
    expect(res.status).toBe(400);
    expect(mockAutocompleteAddress).not.toHaveBeenCalled();
  });

  it('returns 200 with the autocomplete result for a venue_verifier+ caller', async () => {
    mockGetAdminRole.mockResolvedValue('venue_verifier');
    mockRoleAtLeast.mockReturnValue(true);
    mockAutocompleteAddress.mockResolvedValue({
      configured: true,
      suggestions: [{ placeId: 'place-1', text: '123 Main St, Vancouver, BC' }],
    });
    const res = await venueRouter.request('/places/autocomplete?input=123+Main&sessiontoken=tok', {
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect(mockAutocompleteAddress).toHaveBeenCalledWith('123 Main', 'tok');
    expect((await res.json()).suggestions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /places/details
// ---------------------------------------------------------------------------

describe('GET /places/details', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request('/places/details?placeId=place-1&sessiontoken=tok');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is below venue_verifier', async () => {
    mockGetAdminRole.mockResolvedValue(null);
    mockRoleAtLeast.mockReturnValue(false);
    const res = await venueRouter.request('/places/details?placeId=place-1&sessiontoken=tok', {
      headers: withAuth(),
    });
    expect(res.status).toBe(403);
    expect(mockGetPlaceDetails).not.toHaveBeenCalled();
  });

  it('returns 400 when placeId or sessiontoken is missing', async () => {
    mockGetAdminRole.mockResolvedValue('venue_verifier');
    mockRoleAtLeast.mockReturnValue(true);
    const res = await venueRouter.request('/places/details?placeId=place-1', { headers: withAuth() });
    expect(res.status).toBe(400);
    expect(mockGetPlaceDetails).not.toHaveBeenCalled();
  });

  it('returns 200 with the place details for a venue_verifier+ caller', async () => {
    mockGetAdminRole.mockResolvedValue('venue_verifier');
    mockRoleAtLeast.mockReturnValue(true);
    mockGetPlaceDetails.mockResolvedValue({
      configured: true,
      details: { address: '123 Main St', city: 'Vancouver', region: 'BC', lat: 49.28, lng: -123.12 },
    });
    const res = await venueRouter.request('/places/details?placeId=place-1&sessiontoken=tok', {
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-1', 'tok');
    expect((await res.json()).details).toMatchObject({ city: 'Vancouver' });
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe('GET /:id', () => {
  it('returns 200 with the venue when found', async () => {
    mockGetVenueById.mockResolvedValue(VENUE as any);
    const res = await venueRouter.request(`/${VENUE_ID}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(VENUE_ID);
  });

  it('returns 404 when the venue is not found', async () => {
    mockGetVenueById.mockResolvedValue(null);
    const res = await venueRouter.request(`/${VENUE_ID}`);
    expect(res.status).toBe(404);
  });

  it('does not require an Authorization header', async () => {
    mockGetVenueById.mockResolvedValue(VENUE as any);
    const res = await venueRouter.request(`/${VENUE_ID}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe('POST /', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request('/', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an admin', async () => {
    mockCreateVenue.mockResolvedValue(null);
    const res = await venueRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hub' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 201 with the created venue on success', async () => {
    mockCreateVenue.mockResolvedValue(VENUE as any);
    const res = await venueRouter.request('/', {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hub' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(VENUE_ID);
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id
// ---------------------------------------------------------------------------

describe('PATCH /:id', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}`, { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the venue is not found or the user is not authorized', async () => {
    mockUpdateVenue.mockResolvedValue(null);
    const res = await venueRouter.request(`/${VENUE_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the updated venue on success', async () => {
    mockUpdateVenue.mockResolvedValue(VENUE as any);
    const res = await venueRouter.request(`/${VENUE_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(VENUE_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/claim
// ---------------------------------------------------------------------------

describe('POST /:id/claim', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}/claim`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 409 when the venue is already claimed or not found', async () => {
    mockClaimVenue.mockResolvedValue(null);
    const res = await venueRouter.request(`/${VENUE_ID}/claim`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(409);
  });

  it('returns 200 with the claimed venue on success', async () => {
    mockClaimVenue.mockResolvedValue(VENUE as any);
    const res = await venueRouter.request(`/${VENUE_ID}/claim`, {
      method: 'POST',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(VENUE_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/suggest-edit
// ---------------------------------------------------------------------------

describe('POST /:id/suggest-edit', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when fieldName is missing', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestedValue: 'New Name' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when suggestedValue is missing', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName: 'name' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when fieldName is not an editable venue field, without calling submitEditSuggestion', async () => {
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName: 'claimed_by_account_id', suggestedValue: 'attacker-id' }),
    });
    expect(res.status).toBe(400);
    expect(mockSubmitEditSuggestion).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockSubmitEditSuggestion.mockResolvedValue(false);
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName: 'name', suggestedValue: 'New Name' }),
    });
    expect(res.status).toBe(500);
  });

  it('returns 200 with { success: true } on success', async () => {
    mockSubmitEditSuggestion.mockResolvedValue(true);
    const res = await venueRouter.request(`/${VENUE_ID}/suggest-edit`, {
      method: 'POST',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName: 'name', suggestedValue: 'New Name' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});