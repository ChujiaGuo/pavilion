import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
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

// Chain where all methods return `chain` for chaining.
// Call `chain.resolveAs(value)` to make the chain thenable (for queries
// awaited directly without .single(), e.g. listVenues, submitEditSuggestion).
function makeChain() {
  const chain: Record<string, any> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['update'] = vi.fn(() => chain);
  chain['insert'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['single'] = vi.fn();
  chain['resolveAs'] = (value: any) => {
    const p = Promise.resolve(value);
    chain['then'] = p.then.bind(p);
    chain['catch'] = p.catch.bind(p);
    chain['finally'] = p.finally.bind(p);
  };
  return chain;
}

const mockFrom = vi.mocked(supabase.from);

const VENUE_ROW = {
  id: 'venue-1',
  name: 'Badminton Hub',
  type: 'club',
  address: '123 Main St',
  city: 'Vancouver',
  region: 'BC',
  lng: -123.1207,
  lat: 49.2827,
  court_count: 4,
  surface_type: 'synthetic_mat',
  shuttle_type: 'feather',
  drop_in_available: true,
  reservation_required: false,
  contact_phone: null,
  contact_website: null,
  booking_url: null,
  claimed_by_account_id: null,
  created_at: '2026-01-01T00:00:00Z',
  venue_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '21:00' }],
};

const ADMIN_ROW = { user_id: 'admin-1', role: 'admin' };

const CREATE_FIELDS = {
  name: 'Badminton Hub',
  type: 'club' as const,
  address: '123 Main St',
  city: 'Vancouver',
  region: 'BC',
  lat: 49.2827,
  lng: -123.1207,
  courtCount: 4,
  surfaceType: 'synthetic_mat' as const,
  shuttleType: 'feather' as const,
  dropInAvailable: true,
  reservationRequired: false,
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// getVenueById
// ---------------------------------------------------------------------------

describe('getVenueById', () => {
  it('returns a mapped camelCase venue when found', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);
    chain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });

    const venue = await getVenueById('venue-1');
    expect(venue).toMatchObject({
      id: 'venue-1',
      name: 'Badminton Hub',
      courtCount: 4,
      surfaceType: 'synthetic_mat',
      dropInAvailable: true,
    });
  });

  it('passes through the lng/lat generated columns unchanged', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);
    chain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });

    const venue = await getVenueById('venue-1');
    expect(venue?.lng).toBe(-123.1207);
    expect(venue?.lat).toBe(49.2827);
  });

  it('maps venue_hours rows into the hours array', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);
    chain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });

    const venue = await getVenueById('venue-1');
    expect(venue?.hours).toEqual([{ dayOfWeek: 1, openTime: '09:00', closeTime: '21:00' }]);
  });

  it('returns null on DB error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    expect(await getVenueById('venue-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listVenues
// ---------------------------------------------------------------------------

describe('listVenues', () => {
  it('returns an array of mapped venues', async () => {
    const chain = makeChain();
    chain.resolveAs({ data: [VENUE_ROW], error: null });
    mockFrom.mockReturnValue(chain);

    const venues = await listVenues();
    expect(venues).toHaveLength(1);
    expect(venues[0]).toMatchObject({ id: 'venue-1', courtCount: 4 });
  });

  it('returns an empty array on DB error', async () => {
    const chain = makeChain();
    chain.resolveAs({ data: null, error: new Error('DB error') });
    mockFrom.mockReturnValue(chain);

    expect(await listVenues()).toEqual([]);
  });

  it('passes the city filter to the query', async () => {
    const chain = makeChain();
    chain.resolveAs({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listVenues({ city: 'Vancouver' });
    expect(chain['eq']).toHaveBeenCalledWith('city', 'Vancouver');
  });

  it('passes the type filter to the query', async () => {
    const chain = makeChain();
    chain.resolveAs({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listVenues({ type: 'club' });
    expect(chain['eq']).toHaveBeenCalledWith('type', 'club');
  });

  it('passes the dropInAvailable filter to the query', async () => {
    const chain = makeChain();
    chain.resolveAs({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listVenues({ dropInAvailable: true });
    expect(chain['eq']).toHaveBeenCalledWith('drop_in_available', true);
  });
});

// ---------------------------------------------------------------------------
// createVenue
// ---------------------------------------------------------------------------

describe('createVenue', () => {
  it('returns null when the user is not an admin', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(adminChain);

    expect(await createVenue('non-admin', CREATE_FIELDS)).toBeNull();
  });

  it('inserts with correct snake_case field names', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const venueChain = makeChain();
    venueChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(venueChain).mockReturnValueOnce(auditChain);

    await createVenue('admin-1', CREATE_FIELDS);
    expect(venueChain['insert']).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Badminton Hub',
        court_count: 4,
        surface_type: 'synthetic_mat',
        shuttle_type: 'feather',
        drop_in_available: true,
        reservation_required: false,
      })
    );
  });

  it('formats location as an EWKT string', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const venueChain = makeChain();
    venueChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(venueChain).mockReturnValueOnce(auditChain);

    await createVenue('admin-1', CREATE_FIELDS);
    expect(venueChain['insert']).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'SRID=4326;POINT(-123.1207 49.2827)' })
    );
  });

  it('returns the mapped venue on success', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const venueChain = makeChain();
    venueChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(venueChain).mockReturnValueOnce(auditChain);

    const venue = await createVenue('admin-1', CREATE_FIELDS);
    expect(venue).toMatchObject({ id: 'venue-1', name: 'Badminton Hub' });
  });

  it('returns null on DB insert error', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const venueChain = makeChain();
    venueChain['single'].mockResolvedValue({ data: null, error: new Error('insert failed') });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(venueChain);

    expect(await createVenue('admin-1', CREATE_FIELDS)).toBeNull();
  });

  it('always writes an admin_venue_edits audit row on success (venue_verifier+ is required to create at all)', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const venueChain = makeChain();
    venueChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(venueChain).mockReturnValueOnce(auditChain);

    await createVenue('admin-1', CREATE_FIELDS);
    expect(auditChain['insert']).toHaveBeenCalledWith({
      venue_id: 'venue-1',
      performed_by: 'admin-1',
      action: 'create',
      changes: null,
    });
  });
});

// ---------------------------------------------------------------------------
// updateVenue
// ---------------------------------------------------------------------------

describe('updateVenue', () => {
  it('returns null when the update affects no rows (user is not the claimed account holder)', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: null, error: null }); // not admin
    const updateChain = makeChain();
    // claimed_by_account_id filter excludes the row -> 0 rows -> .single() errors
    updateChain['single'].mockResolvedValue({ data: null, error: new Error('no rows') });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(updateChain);

    expect(await updateVenue('venue-1', 'user-1', { name: 'New Name' })).toBeNull();
  });

  it('scopes the update to rows claimed by the requesting user when not admin', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: null, error: null }); // not admin
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(updateChain);

    expect(await updateVenue('venue-1', 'user-1', { name: 'New Name' })).not.toBeNull();
    expect(updateChain['eq']).toHaveBeenCalledWith('id', 'venue-1');
    expect(updateChain['eq']).toHaveBeenCalledWith('claimed_by_account_id', 'user-1');
  });

  it('allows update when user is an admin and skips the claimed_by check', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null }); // is admin
    const beforeChain = makeChain();
    beforeChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: { ...VENUE_ROW, name: 'New Name' }, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom
      .mockReturnValueOnce(adminChain)
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(auditChain);

    expect(await updateVenue('venue-1', 'admin-1', { name: 'New Name' })).not.toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(4); // admins check + before-fetch + update + audit insert
    expect(updateChain['eq']).toHaveBeenCalledWith('id', 'venue-1');
    expect(updateChain['eq']).not.toHaveBeenCalledWith('claimed_by_account_id', expect.anything());
  });

  it('writes an admin_venue_edits audit row when an admin (not claimed owner) edits a venue', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const beforeChain = makeChain();
    beforeChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null }); // name: 'Badminton Hub'
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: { ...VENUE_ROW, name: 'New Name' }, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom
      .mockReturnValueOnce(adminChain)
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(auditChain);

    await updateVenue('venue-1', 'admin-1', { name: 'New Name' });
    expect(auditChain['insert']).toHaveBeenCalledWith({
      venue_id: 'venue-1',
      performed_by: 'admin-1',
      action: 'edit',
      changes: [{ field: 'name', before: 'Badminton Hub', after: 'New Name' }],
    });
  });

  it('excludes patched fields that resolve to the same value from the audit diff', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const beforeChain = makeChain();
    beforeChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null }); // city: 'Vancouver'
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: { ...VENUE_ROW, name: 'New Name' }, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom
      .mockReturnValueOnce(adminChain)
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(auditChain);

    // city is re-sent with its existing value alongside the real change to name.
    await updateVenue('venue-1', 'admin-1', { name: 'New Name', city: VENUE_ROW.city });
    expect(auditChain['insert']).toHaveBeenCalledWith({
      venue_id: 'venue-1',
      performed_by: 'admin-1',
      action: 'edit',
      changes: [{ field: 'name', before: 'Badminton Hub', after: 'New Name' }],
    });
  });

  it('does not write an audit row when a claimed owner (non-admin) edits their own venue', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: null, error: null }); // not admin
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(updateChain);

    await updateVenue('venue-1', 'user-1', { name: 'New Name' });
    // admins check + update only — no before-fetch, no admin_venue_edits insert.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('only sends provided fields in the update payload', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const beforeChain = makeChain();
    beforeChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const auditChain = makeChain();
    auditChain.resolveAs({ error: null });
    mockFrom
      .mockReturnValueOnce(adminChain)
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(auditChain);

    await updateVenue('venue-1', 'admin-1', { name: 'New Name' });

    const updateArg = updateChain['update'].mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(updateArg)).toEqual(['name']);
  });

  it('returns null on DB update error', async () => {
    const adminChain = makeChain();
    adminChain['single'].mockResolvedValue({ data: ADMIN_ROW, error: null });
    const beforeChain = makeChain();
    beforeChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: null, error: new Error('update failed') });
    mockFrom.mockReturnValueOnce(adminChain).mockReturnValueOnce(beforeChain).mockReturnValueOnce(updateChain);

    expect(await updateVenue('venue-1', 'admin-1', { name: 'New Name' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// claimVenue
// ---------------------------------------------------------------------------

describe('claimVenue', () => {
  it('returns null when the venue is already claimed (update matches no rows)', async () => {
    const chain = makeChain();
    // claimed_by_account_id IS NULL filter excludes the row -> 0 rows -> .single() errors
    chain['single'].mockResolvedValue({ data: null, error: new Error('no rows') });
    mockFrom.mockReturnValue(chain);

    expect(await claimVenue('venue-1', 'user-1')).toBeNull();
  });

  it('returns null when the venue does not exist', async () => {
    const chain = makeChain();
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });
    mockFrom.mockReturnValue(chain);

    expect(await claimVenue('venue-1', 'user-1')).toBeNull();
  });

  it('sets claimed_by_account_id to the requesting user and guards on claimed_by_account_id IS NULL', async () => {
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    mockFrom.mockReturnValue(updateChain);

    await claimVenue('venue-1', 'user-1');
    expect(updateChain['update']).toHaveBeenCalledWith({ claimed_by_account_id: 'user-1' });
    expect(updateChain['eq']).toHaveBeenCalledWith('id', 'venue-1');
    expect(updateChain['is']).toHaveBeenCalledWith('claimed_by_account_id', null);
  });

  it('returns the updated venue on success', async () => {
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    mockFrom.mockReturnValue(updateChain);

    const venue = await claimVenue('venue-1', 'user-1');
    expect(venue).toMatchObject({ id: 'venue-1' });
  });

  it('only issues a single query (no separate pre-check)', async () => {
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({ data: VENUE_ROW, error: null });
    mockFrom.mockReturnValue(updateChain);

    await claimVenue('venue-1', 'user-1');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// submitEditSuggestion
// ---------------------------------------------------------------------------

describe('submitEditSuggestion', () => {
  it('returns true on success', async () => {
    const chain = makeChain();
    chain.resolveAs({ error: null });
    mockFrom.mockReturnValue(chain);

    expect(await submitEditSuggestion('venue-1', 'user-1', 'name', 'New Name')).toBe(true);
  });

  it('returns false on DB error', async () => {
    const chain = makeChain();
    chain.resolveAs({ error: new Error('DB error') });
    mockFrom.mockReturnValue(chain);

    expect(await submitEditSuggestion('venue-1', 'user-1', 'name', 'New Name')).toBe(false);
  });

  it('inserts with the correct fields', async () => {
    const chain = makeChain();
    chain.resolveAs({ error: null });
    mockFrom.mockReturnValue(chain);

    await submitEditSuggestion('venue-1', 'user-1', 'name', 'New Name');
    expect(chain['insert']).toHaveBeenCalledWith({
      venue_id: 'venue-1',
      submitted_by: 'user-1',
      field_name: 'name',
      suggested_value: 'New Name',
    });
  });
});