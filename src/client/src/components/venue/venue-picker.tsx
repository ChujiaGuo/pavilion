'use client';

import { useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
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
import type { Venue } from '@pavilion/types';

// Matches every other debounced search field in this codebase (session
// filters, admin panel searches) -- see technical-notes.md's "Admin panel
// searches are debounced, not submit-driven".
const SEARCH_DEBOUNCE_MS = 400;

export interface VenuePickerValue {
  venueId: string | null;
  venueName: string;
}

interface VenuePickerProps {
  accessToken: string;
  value: VenuePickerValue;
  onChange: (value: VenuePickerValue) => void;
  /**
   * true (session create form): free text is a legitimate final value on its
   * own -- brainstorm.md's "unofficial venue, organizer posts it directly,
   * no venue listing needed". No clear button; blank is a normal state.
   * false (session filters): this field only ever contributes an actual
   * venue_id -- free-typed text that hasn't been clicked into a real venue
   * never filters anything (the parent only reads venueId, never venueName,
   * when building the request). Shows a clear button once a venue is picked.
   */
  allowFreeText: boolean;
  id?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  // Fired synchronously right after a suggestion is picked -- lets the
  // caller move focus to whatever field comes next (see
  // session-form-fields.tsx), the same "advance focus on pick" pattern
  // venue-address-autocomplete.tsx uses for the admin venue-creation form.
  onSelect?: () => void;
}

// Shared debounced venue search used by both the create-session form and the
// session Browse filters (see technical-notes.md) -- typing always clears
// any previously-picked venueId (the committed value only ever changes back
// to non-null when a suggestion is explicitly clicked), so a stale filter
// can never silently survive an edited search box.
export function VenuePicker({
  accessToken,
  value,
  onChange,
  allowFreeText,
  id,
  placeholder,
  required,
  className,
  onSelect,
}: VenuePickerProps) {
  const [query, setQuery] = useState(value.venueName);
  const [suggestions, setSuggestions] = useState<Venue[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const requestSeq = useRef(0);

  // Keep the input's text in sync when the value changes externally (e.g.
  // "Reset to defaults" in session-filters, or the create-session form
  // resetting after submit) -- but not on every keystroke, since query is
  // the source of truth for what the user is currently typing.
  useEffect(() => {
    setQuery(value.venueName);
  }, [value.venueName]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    // A pick (handlePick) sets `query` to the picked venue's own name, which
    // would otherwise re-trigger this same effect and re-search for -- then
    // reopen the dropdown on -- a venue that's already committed. Skipping
    // whenever the text still matches a committed venueId means this is
    // gated on the actual committed value, not on focus having moved away
    // (which callers aren't required to do -- see VenuePicker's onSelect).
    if (value.venueId && trimmed === value.venueName.trim()) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timeout = setTimeout(() => {
      apiGet<{ venues: Venue[] }>(`/api/venues?name=${encodeURIComponent(trimmed)}`, accessToken)
        .then((res) => {
          if (requestSeq.current === seq) setSuggestions(res.venues);
        })
        .catch(() => {
          if (requestSeq.current === seq) setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, accessToken, value.venueId, value.venueName]);

  useEffect(() => {
    setIsOpen(suggestions.length > 0);
  }, [suggestions]);

  // Base UI's Autocomplete auto-fills the input's text when an item is
  // pressed (`fillInputOnItemPress`), which calls this same onValueChange
  // handler with `reason: 'item-press'` -- if it also ran the "clear
  // venueId" branch below, it would immediately clobber the venueId
  // handlePick just set, since both fire off the same click. Only real
  // typing should clear a previously-picked venue.
  function handleInputChange(text: string, eventDetails?: { reason?: string }) {
    setQuery(text);
    if (eventDetails?.reason === 'item-press') return;
    onChange({ venueId: null, venueName: text });
  }

  function handlePick(venue: Venue) {
    setQuery(venue.name);
    setSuggestions([]);
    setIsOpen(false);
    onChange({ venueId: venue.id, venueName: venue.name });
    onSelect?.();
  }

  function handleClear() {
    setQuery('');
    setSuggestions([]);
    onChange({ venueId: null, venueName: '' });
  }

  return (
    <div className="relative">
      <Autocomplete
        items={suggestions}
        mode="none"
        value={query}
        onValueChange={handleInputChange}
        open={isOpen}
        onOpenChange={setIsOpen}
        itemToStringValue={(v: Venue) => v.name}
      >
        <AutocompleteInput
          id={id}
          placeholder={placeholder}
          required={required}
          className={className}
        />
        <AutocompleteContent>
          <AutocompleteEmpty>No venues found</AutocompleteEmpty>
          <AutocompleteList>
            <AutocompleteCollection>
              {(venue: Venue) => (
                <AutocompleteItem key={venue.id} value={venue} onClick={() => handlePick(venue)}>
                  <div>
                    <p className="font-medium">{venue.name}</p>
                    <p className="text-xs text-neutral-500">
                      {[venue.city, venue.region].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </AutocompleteItem>
              )}
            </AutocompleteCollection>
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
      {!allowFreeText && value.venueId && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear venue filter"
          className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-neutral-600"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
