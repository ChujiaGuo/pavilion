'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react';
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query';
import { SlidersHorizontal } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { fieldClassName, labelClassName } from '@/components/session/field-styles';
import type { GeolocationStatus } from '@/lib/hooks/use-geolocation';
import type { VenueType } from '@pavilion/types';

// Same 400ms reactive-debounce convention as session-filters.tsx -- see
// technical-notes.md's "Browse filters are reactive, not submit-driven".
const APPLY_DEBOUNCE_MS = 400;

const VENUE_TYPE_OPTIONS: { id: VenueType; label: string }[] = [
  { id: 'club', label: 'Club' },
  { id: 'rec_center', label: 'Rec center' },
  { id: 'community_center', label: 'Community center' },
  { id: 'gym', label: 'Gym' },
];

const RADIUS_OPTIONS = ['5', '10', '25', '50', '100'];

export interface VenueBrowseFilters {
  search: string;
  type: VenueType | '';
  dropInOnly: boolean;
  // '' means "Any distance" (no radius filter, no distance sort) -- distinct
  // from a specific radius like '25'. Only takes effect once geolocation has
  // resolved to 'granted' (see VenueFiltersProps.geolocationStatus) -- picking
  // a radius before that is what triggers the permission request in the
  // first place (see handleDistanceChange below).
  radiusMiles: string;
}

interface VenueFiltersProps {
  value: VenueBrowseFilters;
  geolocationStatus: GeolocationStatus;
  onRequestLocation: () => void;
  onApply: (filters: VenueBrowseFilters) => void;
}

const pillTriggerClassName =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-muted';

interface SecondaryFilterFieldsProps {
  draft: VenueBrowseFilters;
  onChange: (patch: Partial<VenueBrowseFilters>) => void;
}

function SecondaryFilterFields({ draft, onChange }: SecondaryFilterFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Type</Label>
        <RadioGroup
          value={draft.type}
          onValueChange={(v) => onChange({ type: v as VenueType })}
          className="gap-3"
        >
          {VENUE_TYPE_OPTIONS.map((option) => (
            <div key={option.id} className="flex items-center gap-3">
              <RadioGroupItem value={option.id} id={`venue-type-${option.id}`} />
              <Label htmlFor={`venue-type-${option.id}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <label className="flex items-center gap-2 text-sm font-normal">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.dropInOnly}
          onChange={(e) => onChange({ dropInOnly: e.target.checked })}
        />
        Drop-in available only
      </label>
    </div>
  );
}

// Structurally mirrors session-filters.tsx's SessionFilters: Search stays
// inline as the always-visible primary control (same underline field style,
// field-styles.ts), plus Distance (also always visible -- see
// handleDistanceChange); Type and Drop-in-available sit behind the same
// responsive "More filters" disclosure (Drawer below sm, Popover at sm+).
export function VenueFilters({ value, geolocationStatus, onRequestLocation, onApply }: VenueFiltersProps) {
  const [draft, setDraft] = useState<VenueBrowseFilters>(value);
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)', { noSsr: true });
  const lastAppliedRef = useRef(JSON.stringify(value));

  // A radius picked before geolocation has resolved to 'granted' -- held
  // here rather than applied to `draft` immediately, since `draft.radiusMiles`
  // set to a value geolocation hasn't actually backed yet would silently no-op
  // (the page only sends lat/lng/radius once granted) while still showing
  // that radius as selected. Applied once permission resolves; discarded on
  // denial/unsupported so the select falls back to "Any distance".
  const [pendingRadius, setPendingRadius] = useState<string | null>(null);

  const hasSecondaryFilters = draft.type !== '' || draft.dropInOnly;

  useEffect(() => {
    const serialized = JSON.stringify(draft);
    if (serialized === lastAppliedRef.current) return;
    const timeout = setTimeout(() => {
      lastAppliedRef.current = serialized;
      onApply(draft);
    }, APPLY_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft, onApply]);

  function handleDraftChange(patch: Partial<VenueBrowseFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  useEffect(() => {
    if (pendingRadius === null) return;
    if (geolocationStatus === 'granted') {
      handleDraftChange({ radiusMiles: pendingRadius });
      setPendingRadius(null);
    } else if (geolocationStatus === 'denied' || geolocationStatus === 'unsupported') {
      setPendingRadius(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocationStatus, pendingRadius]);

  // The Distance control is the trigger for the location permission
  // request, not page load (see technical-notes.md) -- selecting "Any
  // distance" never needs a location, but any real radius does.
  function handleDistanceChange(nextRadius: string) {
    if (nextRadius === '') {
      setPendingRadius(null);
      handleDraftChange({ radiusMiles: '' });
      return;
    }
    if (geolocationStatus === 'granted') {
      handleDraftChange({ radiusMiles: nextRadius });
      return;
    }
    setPendingRadius(nextRadius);
    onRequestLocation();
  }

  function handleReset() {
    const reset: VenueBrowseFilters = { ...draft, type: '', dropInOnly: false };
    lastAppliedRef.current = JSON.stringify(reset);
    setDraft(reset);
    onApply(reset);
    setIsOpen(false);
  }

  const trigger = (
    <>
      <SlidersHorizontal className="size-4" aria-hidden />
      More filters
      {hasSecondaryFilters && (
        <span className="size-1.5 shrink-0 rounded-full bg-primary" role="status" aria-label="Additional filters active" />
      )}
    </>
  );

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="min-w-[9rem] flex-1 basis-40">
        <label htmlFor="venue-filter-search" className={labelClassName}>
          Search
        </label>
        <input
          id="venue-filter-search"
          type="text"
          placeholder="Venue name"
          value={draft.search}
          onChange={(e) => handleDraftChange({ search: e.target.value })}
          className={fieldClassName}
        />
      </div>

      <div className="min-w-[9rem] flex-1 basis-40">
        <label htmlFor="venue-filter-distance" className={labelClassName}>
          Distance
        </label>
        <select
          id="venue-filter-distance"
          value={pendingRadius ?? draft.radiusMiles}
          onChange={(e) => handleDistanceChange(e.target.value)}
          className={cn(fieldClassName, 'appearance-none bg-transparent')}
        >
          <option value="">Any distance</option>
          {RADIUS_OPTIONS.map((mi) => (
            <option key={mi} value={mi}>
              {mi} mi
            </option>
          ))}
        </select>
        {geolocationStatus === 'loading' && (
          <p className="mt-1 text-xs text-neutral-500">Requesting location…</p>
        )}
        {geolocationStatus === 'denied' && (
          <p className="mt-1 text-xs text-neutral-500">Location access denied — showing all venues.</p>
        )}
        {geolocationStatus === 'unsupported' && (
          <p className="mt-1 text-xs text-neutral-500">Location isn&apos;t available in this browser.</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col">
        <span className={cn(labelClassName, 'invisible')} aria-hidden>
          Actions
        </span>
        <div className="mt-1 flex items-center gap-3">
          {isDesktop ? (
            <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
              <PopoverPrimitive.Trigger className={pillTriggerClassName}>{trigger}</PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
                  <PopoverPrimitive.Popup
                    data-slot="venue-filter-popover-popup"
                    className="w-72 origin-(--transform-origin) rounded-lg bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">More filters</p>
                    <div className="mt-4">
                      <SecondaryFilterFields draft={draft} onChange={handleDraftChange} />
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
                      >
                        Reset to defaults
                      </button>
                    </div>
                  </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className={pillTriggerClassName}
              >
                {trigger}
              </button>
              <Drawer open={isOpen} onOpenChange={setIsOpen}>
                <DrawerContent aria-label="More filters">
                  <DrawerHeader>
                    <DrawerTitle className="font-sans text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
                      More filters
                    </DrawerTitle>
                    <DrawerDescription>Narrow venues down by type.</DrawerDescription>
                  </DrawerHeader>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <SecondaryFilterFields draft={draft} onChange={handleDraftChange} />
                  </div>
                  <DrawerFooter className="flex-row items-center justify-between">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      Reset to defaults
                    </button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
