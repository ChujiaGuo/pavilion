import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autocompleteAddress, getPlaceDetails } from '../venue.places.js';

const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;

function mockFetchOnce(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
});

// ---------------------------------------------------------------------------
// autocompleteAddress
// ---------------------------------------------------------------------------

describe('autocompleteAddress', () => {
  it('returns configured: false and never calls fetch when no API key is set', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn();

    const result = await autocompleteAddress('123 Main', 'session-token-1');
    expect(result).toEqual({ configured: false, suggestions: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps a real Places API (New) autocomplete response into { placeId, text } pairs', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    // Real Places API (New) shape -- suggestions[].placePrediction, not a flat
    // prediction list like the legacy (non-"New") Places API.
    mockFetchOnce({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ_place1',
            text: { text: '1600 Amphitheatre Parkway, Mountain View, CA, USA' },
            structuredFormat: {
              mainText: { text: '1600 Amphitheatre Parkway' },
              secondaryText: { text: 'Mountain View, CA, USA' },
            },
          },
        },
        {
          placePrediction: {
            placeId: 'ChIJ_place2',
            text: { text: '1601 Amphitheatre Parkway, Mountain View, CA, USA' },
          },
        },
      ],
    });

    const result = await autocompleteAddress('1600 Amphitheatre', 'session-token-1');
    expect(result).toEqual({
      configured: true,
      suggestions: [
        { placeId: 'ChIJ_place1', text: '1600 Amphitheatre Parkway, Mountain View, CA, USA' },
        { placeId: 'ChIJ_place2', text: '1601 Amphitheatre Parkway, Mountain View, CA, USA' },
      ],
    });
  });

  it('sends the API key, input, and session token in the request', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({ suggestions: [] });

    await autocompleteAddress('1600 Amphitheatre', 'session-token-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-key' }),
        body: JSON.stringify({
          input: '1600 Amphitheatre',
          sessionToken: 'session-token-1',
          includedRegionCodes: ['us'],
        }),
      })
    );
  });

  it('returns an empty suggestion list (but configured: true) on a Google error response', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({ error: { code: 400, message: 'Invalid request' } }, false);

    const result = await autocompleteAddress('bad input', 'session-token-1');
    expect(result).toEqual({ configured: true, suggestions: [] });
  });

  it('skips a suggestion missing placeId or text rather than throwing', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({
      suggestions: [{ placePrediction: { placeId: 'ChIJ_ok', text: { text: 'Valid' } } }, { placePrediction: {} }, {}],
    });

    const result = await autocompleteAddress('input', 'session-token-1');
    expect(result.suggestions).toEqual([{ placeId: 'ChIJ_ok', text: 'Valid' }]);
  });
});

// ---------------------------------------------------------------------------
// getPlaceDetails
// ---------------------------------------------------------------------------

describe('getPlaceDetails', () => {
  it('returns configured: false and never calls fetch when no API key is set', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn();

    const result = await getPlaceDetails('ChIJ_place1', 'session-token-1');
    expect(result).toEqual({ configured: false, details: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('parses a real Places API (New) details response into address/city/region/lat/lng', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    // Real Places API (New) shape -- longText/shortText, not the legacy
    // Places API's long_name/short_name.
    mockFetchOnce({
      id: 'ChIJ_place1',
      formattedAddress: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
      addressComponents: [
        { longText: '1600', shortText: '1600', types: ['street_number'] },
        { longText: 'Amphitheatre Parkway', shortText: 'Amphitheatre Pkwy', types: ['route'] },
        { longText: 'Mountain View', shortText: 'Mountain View', types: ['locality', 'political'] },
        { longText: 'Santa Clara County', shortText: 'Santa Clara County', types: ['administrative_area_level_2'] },
        { longText: 'California', shortText: 'CA', types: ['administrative_area_level_1', 'political'] },
        { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
        { longText: '94043', shortText: '94043', types: ['postal_code'] },
      ],
      location: { latitude: 37.4221, longitude: -122.0841 },
    });

    const result = await getPlaceDetails('ChIJ_place1', 'session-token-1');
    expect(result).toEqual({
      configured: true,
      details: {
        address: '1600 Amphitheatre Parkway',
        city: 'Mountain View',
        region: 'CA',
        lat: 37.4221,
        lng: -122.0841,
      },
    });
  });

  it('sends the API key, session token, and field mask in the request', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({
      addressComponents: [
        { longText: 'X', shortText: 'X', types: ['locality'] },
        { longText: 'CA', shortText: 'CA', types: ['administrative_area_level_1'] },
      ],
      location: { latitude: 1, longitude: 2 },
    });

    await getPlaceDetails('ChIJ_place1', 'session-token-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/ChIJ_place1?sessionToken=session-token-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-key',
          'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
        }),
      })
    );
  });

  it('returns details: null on a Google error response', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({ error: { code: 404, message: 'Not found' } }, false);

    const result = await getPlaceDetails('ChIJ_missing', 'session-token-1');
    expect(result).toEqual({ configured: true, details: null });
  });

  it('returns details: null when city or region components are missing, without throwing', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({
      addressComponents: [{ longText: 'X', shortText: 'X', types: ['route'] }],
      location: { latitude: 1, longitude: 2 },
    });

    const result = await getPlaceDetails('ChIJ_incomplete', 'session-token-1');
    expect(result).toEqual({ configured: true, details: null });
  });

  it('falls back to formattedAddress when no street_number/route components are present', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockFetchOnce({
      formattedAddress: 'Somewhere Park, Mountain View, CA, USA',
      addressComponents: [
        { longText: 'Mountain View', shortText: 'Mountain View', types: ['locality'] },
        { longText: 'California', shortText: 'CA', types: ['administrative_area_level_1'] },
      ],
      location: { latitude: 37.4, longitude: -122.1 },
    });

    const result = await getPlaceDetails('ChIJ_park', 'session-token-1');
    expect(result.details?.address).toBe('Somewhere Park, Mountain View, CA, USA');
  });
});
