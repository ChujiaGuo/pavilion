import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createVenue, getVenueById } from '../domains/venue/venue.service.js';
import { createTestUser, makeAdmin, truncateAll, closePgClient } from '../test/integration-helpers.js';

describe('venue PostGIS round trip (integration)', () => {
  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closePgClient();
  });

  it('round-trips lat/lng through PostGIS geography storage and the real PostgREST read shape', async () => {
    const admin = await createTestUser();
    await makeAdmin(admin.id);

    const created = await createVenue(admin.id, {
      name: 'Test Court',
      type: 'club',
      address: '123 Test St',
      city: 'Testville',
      region: 'TS',
      lat: 37.7749,
      lng: -122.4194,
      courtCount: 4,
      surfaceType: 'wood',
      shuttleType: 'feather',
      dropInAvailable: true,
      reservationRequired: false,
    });

    expect(created).not.toBeNull();
    expect(created!.lat).toBeCloseTo(37.7749, 4);
    expect(created!.lng).toBeCloseTo(-122.4194, 4);

    const fetched = await getVenueById(created!.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.lat).toBeCloseTo(37.7749, 4);
    expect(fetched!.lng).toBeCloseTo(-122.4194, 4);
    expect(fetched!.hours).toEqual([]);
  });
});