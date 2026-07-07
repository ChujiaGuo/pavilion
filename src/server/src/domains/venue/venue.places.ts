// Google Places API (New) proxy -- pure, no Supabase import, same split
// rationale as rating.algorithm.ts (unit-testable, no DB connection needed).
// Used only by the admin venue-creation address field (venue.router.ts's
// /places/autocomplete + /places/details). Kept server-side rather than
// loaded as a client-side script so the API key never reaches the browser
// and this app's strict script-src 'self' CSP (see technical-notes.md
// "Security Headers") never needs a maps.googleapis.com exception.

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface AddressSuggestion {
  placeId: string;
  text: string;
}

export interface AutocompleteResult {
  configured: boolean;
  suggestions: AddressSuggestion[];
}

export interface PlaceDetails {
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
}

export interface PlaceDetailsResult {
  configured: boolean;
  details: PlaceDetails | null;
}

// Real Places API (New) response shapes -- confirmed against Google's
// current documentation, not a simplified guess. Autocomplete's prediction
// text and Details' address components both nest one level deeper than the
// legacy (non-"New") Places API did.
interface AutocompleteApiResponse {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
    };
  }[];
}

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface PlaceDetailsApiResponse {
  id?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude: number; longitude: number };
}

function apiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || undefined;
}

// US-first per brainstorm.md's Go-to-Market Thoughts.
const INCLUDED_REGION_CODES = ['us'];

export async function autocompleteAddress(input: string, sessionToken: string): Promise<AutocompleteResult> {
  const key = apiKey();
  if (!key) return { configured: false, suggestions: [] };

  const res = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({ input, sessionToken, includedRegionCodes: INCLUDED_REGION_CODES }),
  });

  if (!res.ok) return { configured: true, suggestions: [] };

  const data = (await res.json()) as AutocompleteApiResponse;
  const suggestions = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId && !!p.text?.text)
    .map((p) => ({ placeId: p.placeId, text: p.text!.text }));

  return { configured: true, suggestions };
}

function findComponent(components: AddressComponent[], type: string): AddressComponent | undefined {
  return components.find((c) => c.types.includes(type));
}

export async function getPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetailsResult> {
  const key = apiKey();
  if (!key) return { configured: false, details: null };

  const res = await fetch(
    `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
      },
    },
  );

  if (!res.ok) return { configured: true, details: null };

  const data = (await res.json()) as PlaceDetailsApiResponse;
  const components = data.addressComponents ?? [];
  const streetNumber = findComponent(components, 'street_number')?.longText;
  const route = findComponent(components, 'route')?.longText;
  const city = findComponent(components, 'locality')?.longText;
  // shortText is already the 2-letter USPS code the `region` column expects
  // -- same convention us-states.ts uses for the profile-edit State field.
  const region = findComponent(components, 'administrative_area_level_1')?.shortText;
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;

  if (!city || !region || lat === undefined || lng === undefined) {
    return { configured: true, details: null };
  }

  const address = [streetNumber, route].filter(Boolean).join(' ') || data.formattedAddress || '';

  return { configured: true, details: { address, city, region, lat, lng } };
}
