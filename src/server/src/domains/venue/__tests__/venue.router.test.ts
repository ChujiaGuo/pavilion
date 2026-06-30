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

import { supabase } from '../../../lib/supabase.js';
import {
  getVenueById,
  listVenues,
  createVenue,
  updateVenue,
  claimVenue,
  submitEditSuggestion,
} from '../venue.service.js';
import { venueRouter } from '../venue.router.js';

const mockGetUser = vi.mocked(supabase.auth.getUser);
const mockGetVenueById = vi.mocked(getVenueById);
const mockListVenues = vi.mocked(listVenues);
const mockCreateVenue = vi.mocked(createVenue);
const mockUpdateVenue = vi.mocked(updateVenue);
const mockClaimVenue = vi.mocked(claimVenue);
const mockSubmitEditSuggestion = vi.mocked(submitEditSuggestion);

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