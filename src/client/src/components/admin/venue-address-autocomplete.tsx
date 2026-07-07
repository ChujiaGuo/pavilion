'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
  AutocompleteEmpty,
  AutocompleteCollection,
} from '@/components/ui/autocomplete';
import { apiGet } from '@/lib/api';

const SEARCH_DEBOUNCE_MS = 400;

interface AddressSuggestion {
  placeId: string;
  text: string;
}

interface PlaceDetails {
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
}

interface VenueAddressAutocompleteProps {
  accessToken: string;
  id?: string;
  value: string;
  onChange: (address: string) => void;
  onPlaceSelected: (details: PlaceDetails) => void;
  // Fired synchronously the moment a suggestion is clicked, before the
  // place-details lookup even starts -- lets the caller move focus off this
  // field onto whatever comes next (see admin-venues-panel.tsx).
  onSelect?: () => void;
  className?: string;
  required?: boolean;
}

// Google Places (New)-backed address field for the admin venue-creation
// form only (technical-notes.md). Generates a session token per Google's
// session-token billing model -- one token spans an autocomplete search
// through its resulting place-details lookup, then gets discarded and
// regenerated for the next search.
export function VenueAddressAutocomplete({
  accessToken,
  id,
  value,
  onChange,
  onPlaceSelected,
  onSelect,
  className,
  required,
}: VenueAddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const requestSeq = useRef(0);
  // Once a response tells us the server has no Places API key configured,
  // stop trying -- the field silently behaves as plain text for the rest of
  // its lifetime rather than showing a spinner/empty-dropdown on every
  // keystroke forever (see venue.places.ts's `configured` flag).
  const disabledRef = useRef(false);
  // Whenever the admin simply tabs away without picking anything, skip the
  // still-pending debounced search for that abandoned partial text -- a
  // wasted billed Places call otherwise.
  const isFocusedRef = useRef(false);
  // Picking a suggestion sets `value` to the picked text (below), which
  // would otherwise re-trigger this same effect and re-search for -- then
  // reopen the dropdown on -- an address that's already resolved. Checked
  // against the actual picked text (not just focus, which isn't guaranteed
  // to have moved away by the time the debounce fires) -- same fix as
  // venue-picker.tsx's equivalent `value.venueId` check.
  const lastPickedTextRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (disabledRef.current || trimmed.length < 3) {
      setSuggestions([]);
      return;
    }
    if (trimmed === lastPickedTextRef.current) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timeout = setTimeout(() => {
      if (!isFocusedRef.current) return;
      apiGet<{ configured: boolean; suggestions: AddressSuggestion[] }>(
        `/api/venues/places/autocomplete?input=${encodeURIComponent(trimmed)}&sessiontoken=${sessionTokenRef.current}`,
        accessToken,
      )
        .then((res) => {
          if (requestSeq.current !== seq) return;
          if (!res.configured) {
            disabledRef.current = true;
            setSuggestions([]);
            return;
          }
          setSuggestions(res.suggestions);
        })
        .catch(() => {
          if (requestSeq.current === seq) setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, accessToken]);

  useEffect(() => {
    setIsOpen(suggestions.length > 0);
  }, [suggestions]);

  async function handlePick(suggestion: AddressSuggestion) {
    const sessionToken = sessionTokenRef.current;
    setSuggestions([]);
    setIsOpen(false);
    lastPickedTextRef.current = suggestion.text;
    onChange(suggestion.text);
    // Synchronous, before the place-details await below -- moves focus off
    // this field right away rather than leaving it sitting focused.
    onSelect?.();

    try {
      const res = await apiGet<{ configured: boolean; details: PlaceDetails | null }>(
        `/api/venues/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&sessiontoken=${sessionToken}`,
        accessToken,
      );
      if (res.details) onPlaceSelected(res.details);
    } catch {
      // Best-effort -- the address text is already filled in from the
      // suggestion; city/region/lat/lng just stay whatever they were.
    } finally {
      // Session token spans one autocomplete-then-details lookup, per
      // Google's billing model -- regenerate for the next search.
      sessionTokenRef.current = crypto.randomUUID();
    }
  }

  return (
    <Autocomplete
      items={suggestions}
      mode="none"
      value={value}
      onValueChange={onChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      itemToStringValue={(s: AddressSuggestion) => s.text}
    >
      <AutocompleteInput
        id={id}
        className={className}
        required={required}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
      />
      <AutocompleteContent>
        <AutocompleteEmpty>No addresses found</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteCollection>
            {(suggestion: AddressSuggestion) => (
              <AutocompleteItem
                key={suggestion.placeId}
                value={suggestion}
                onClick={() => handlePick(suggestion)}
              >
                {suggestion.text}
              </AutocompleteItem>
            )}
          </AutocompleteCollection>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
