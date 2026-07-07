import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createVenue, getVenueById, listVenues } from '../domains/venue/venue.service.js';
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

  // Exercises the nearby_venues RPC (see the migration of the same name)
  // against a real PostGIS instance -- this is what actually catches the
  // SRID bug (ST_MakePoint produces SRID 0; casting that directly to
  // geography fails/misbehaves) that a mocked unit test structurally can't,
  // since the mock never touches real PostGIS geography math.
  it('nearby_venues finds and orders venues by real geodesic distance, respecting the radius cutoff', async () => {
    const admin = await createTestUser();
    await makeAdmin(admin.id);

    const baseFields = {
      type: 'club' as const,
      address: '1 Test St',
      city: 'Testville',
      region: 'CA',
      courtCount: 2,
      surfaceType: 'wood' as const,
      shuttleType: 'feather' as const,
      dropInAvailable: true,
      reservationRequired: false,
    };

    // 1 degree of latitude is ~69.17 miles regardless of longitude -- offsets
    // are chosen along latitude only so expected distances don't also depend
    // on the (latitude-dependent) length of a degree of longitude.
    const near = await createVenue(admin.id, { ...baseFields, name: 'Near Court', lat: 37.001, lng: -122.0 });
    const mid = await createVenue(admin.id, { ...baseFields, name: 'Mid Court', lat: 37.05, lng: -122.0 });
    const far = await createVenue(admin.id, { ...baseFields, name: 'Far Court', lat: 38.0, lng: -122.0 });
    expect(near).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(far).not.toBeNull();

    const results = await listVenues({ near: { lat: 37.0, lng: -122.0, radiusMiles: 10 } });

    const names = results.map((v) => v.name);
    expect(names).toContain('Near Court');
    expect(names).toContain('Mid Court');
    expect(names).not.toContain('Far Court'); // ~69mi away, outside the 10mi radius

    // Nearest-first order.
    expect(names.indexOf('Near Court')).toBeLessThan(names.indexOf('Mid Court'));

    const nearResult = results.find((v) => v.name === 'Near Court')!;
    const midResult = results.find((v) => v.name === 'Mid Court')!;
    expect(nearResult.distanceMiles).toBeGreaterThan(0);
    expect(nearResult.distanceMiles).toBeLessThan(1);
    expect(midResult.distanceMiles).toBeGreaterThan(2);
    expect(midResult.distanceMiles).toBeLessThan(5);
  });
});