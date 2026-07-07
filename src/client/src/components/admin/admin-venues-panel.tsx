'use client';

import { useEffect, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react';
import { ChevronRight, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RequiredMarker } from '@/components/ui/required-marker';
import { apiGet, apiPost, apiPatch, apiErrorMessage } from '@/lib/api';
import { QUICK_TIMES, formatTimeLabel } from '@/lib/time-of-day';
import { cn } from '@/lib/utils';
import { VenueAddressAutocomplete } from './venue-address-autocomplete';
import type { Venue, VenueType, SurfaceType, ShuttleType } from '@pavilion/types';

const VENUE_TYPE_OPTIONS: { id: VenueType; label: string }[] = [
  { id: 'club', label: 'Club' },
  { id: 'rec_center', label: 'Rec center' },
  { id: 'community_center', label: 'Community center' },
  { id: 'gym', label: 'Gym' },
];

const SURFACE_TYPE_OPTIONS: { id: SurfaceType; label: string }[] = [
  { id: 'synthetic_mat', label: 'Synthetic mat' },
  { id: 'wood', label: 'Wood' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'outdoor', label: 'Outdoor' },
];

const SHUTTLE_TYPE_OPTIONS: { id: ShuttleType; label: string }[] = [
  { id: 'feather', label: 'Feather' },
  { id: 'plastic', label: 'Plastic' },
  { id: 'both', label: 'Both' },
];

// Matches venues/[id]/page.tsx's DAY_LABELS -- dayOfWeek 0 = Sunday.
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayHoursField {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '17:00';

function emptyHours(): DayHoursField[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    isOpen: false,
    openTime: DEFAULT_OPEN_TIME,
    closeTime: DEFAULT_CLOSE_TIME,
  }));
}

interface FormFields {
  name: string;
  type: VenueType;
  address: string;
  city: string;
  region: string;
  lat: string;
  lng: string;
  courtCount: string;
  surfaceType: SurfaceType;
  shuttleType: ShuttleType;
  dropInAvailable: boolean;
  reservationRequired: boolean;
  contactPhone: string;
  contactWebsite: string;
  bookingUrl: string;
  hours: DayHoursField[];
}

const EMPTY_FORM: FormFields = {
  name: '',
  type: 'club',
  address: '',
  city: '',
  region: '',
  lat: '',
  lng: '',
  courtCount: '1',
  surfaceType: 'synthetic_mat',
  shuttleType: 'feather',
  dropInAvailable: false,
  reservationRequired: false,
  contactPhone: '',
  contactWebsite: '',
  bookingUrl: '',
  hours: emptyHours(),
};

function toFormFields(venue: Venue): FormFields {
  // "09:00:00" -> "09:00" -- <input type="time">'s value must be HH:MM,
  // while the DB (and API) round-trips HH:MM:SS.
  const hoursByDay = new Map(venue.hours.map((h) => [h.dayOfWeek as number, h]));
  return {
    name: venue.name,
    type: venue.type,
    address: venue.address,
    city: venue.city,
    region: venue.region,
    lat: String(venue.lat),
    lng: String(venue.lng),
    courtCount: String(venue.courtCount),
    surfaceType: venue.surfaceType,
    shuttleType: venue.shuttleType,
    dropInAvailable: venue.dropInAvailable,
    reservationRequired: venue.reservationRequired,
    contactPhone: venue.contactPhone ?? '',
    contactWebsite: venue.contactWebsite ?? '',
    bookingUrl: venue.bookingUrl ?? '',
    hours: DAY_LABELS.map((_, dayOfWeek) => {
      const existing = hoursByDay.get(dayOfWeek);
      return existing
        ? { dayOfWeek, isOpen: true, openTime: existing.openTime.slice(0, 5), closeTime: existing.closeTime.slice(0, 5) }
        : { dayOfWeek, isOpen: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME };
    }),
  };
}

// Shared by handleCreate/handleSaveEdit -- lat/lng are omitted since the
// create path sends them separately (parsed to numbers) and the update path
// never sends them at all (venue.service.ts's VenueUpdateFields excludes
// them; a venue's location isn't editable after creation).
function toApiPayload(fields: FormFields) {
  return {
    name: fields.name,
    type: fields.type,
    address: fields.address,
    city: fields.city,
    region: fields.region,
    courtCount: Number(fields.courtCount),
    surfaceType: fields.surfaceType,
    shuttleType: fields.shuttleType,
    dropInAvailable: fields.dropInAvailable,
    reservationRequired: fields.reservationRequired,
    contactPhone: fields.contactPhone.trim() || null,
    contactWebsite: fields.contactWebsite.trim() || null,
    bookingUrl: fields.bookingUrl.trim() || null,
    hours: fields.hours
      .filter((h) => h.isOpen)
      .map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime })),
  };
}

function updateDayHours(
  fields: FormFields,
  setFields: (fields: FormFields) => void,
  dayOfWeek: number,
  patch: Partial<DayHoursField>,
) {
  setFields({
    ...fields,
    hours: fields.hours.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)),
  });
}

// Quick-tap time pills in a popover, matching starts-at-picker.tsx's "Starts
// at" time selector (see /sessions/new) -- a compact trigger keeps 7 rows of
// open/close pairs from turning into a wall of buttons, only expanding into
// the pill picker when the admin actually wants to change one.
function TimeOfDayPicker({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerClassName =
    'flex h-8 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-sm outline-none disabled:opacity-40';

  if (disabled) {
    return (
      <span className={cn(triggerClassName, 'text-neutral-400')} aria-label={ariaLabel}>
        {formatTimeLabel(value)}
        <Clock className="size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <PopoverPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(triggerClassName, 'cursor-pointer text-neutral-900')}
      >
        {formatTimeLabel(value)}
        <Clock className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <PopoverPrimitive.Popup
            data-testid={`${ariaLabel}-popup`}
            className="w-64 origin-(--transform-origin) rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <div className="flex flex-wrap gap-2">
              {QUICK_TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onChange(t);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    value === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-neutral-600 hover:bg-muted',
                  )}
                >
                  {formatTimeLabel(t)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-xs font-normal text-neutral-400">Or pick an exact time</label>
              <input
                type="time"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none"
              />
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function VenueFormFields({
  fields,
  setFields,
  idPrefix,
  useAddressAutocomplete,
  accessToken,
}: {
  fields: FormFields;
  setFields: (fields: FormFields) => void;
  idPrefix: string;
  useAddressAutocomplete: boolean;
  accessToken: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>
          Name
          <RequiredMarker />
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={fields.name}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <RadioGroup value={fields.type} onValueChange={(v) => setFields({ ...fields, type: v as VenueType })}>
          {VENUE_TYPE_OPTIONS.map((option) => (
            <div key={option.id} className="flex items-center gap-3">
              <RadioGroupItem value={option.id} id={`${idPrefix}-type-${option.id}`} />
              <Label htmlFor={`${idPrefix}-type-${option.id}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address`}>
          Address
          <RequiredMarker />
        </Label>
        {useAddressAutocomplete ? (
          <VenueAddressAutocomplete
            accessToken={accessToken}
            id={`${idPrefix}-address`}
            value={fields.address}
            onChange={(address) => setFields({ ...fields, address })}
            onPlaceSelected={(details) =>
              setFields({
                ...fields,
                address: details.address,
                city: details.city,
                region: details.region,
                lat: String(details.lat),
                lng: String(details.lng),
              })
            }
            // Moves focus off the address field the instant a suggestion is
            // picked, landing on court count -- city/region are already
            // auto-filled from the selected place, so that's the next field
            // the admin actually needs to touch. Moving focus also stops the
            // address value change from re-triggering the debounced
            // autocomplete search for text that's already resolved, which
            // would otherwise waste a billed Places call (see
            // venue-address-autocomplete.tsx).
            onSelect={() => document.getElementById(`${idPrefix}-courtCount`)?.focus()}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            required
          />
        ) : (
          <Input
            id={`${idPrefix}-address`}
            value={fields.address}
            onChange={(e) => setFields({ ...fields, address: e.target.value })}
            required
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-city`}>
            City
            <RequiredMarker />
          </Label>
          <Input
            id={`${idPrefix}-city`}
            value={fields.city}
            onChange={(e) => setFields({ ...fields, city: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-region`}>
            State
            <RequiredMarker />
          </Label>
          <Input
            id={`${idPrefix}-region`}
            value={fields.region}
            onChange={(e) => setFields({ ...fields, region: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-courtCount`}>
          Court count
          <RequiredMarker />
        </Label>
        <Input
          id={`${idPrefix}-courtCount`}
          type="number"
          min="1"
          value={fields.courtCount}
          onChange={(e) => setFields({ ...fields, courtCount: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Surface type</Label>
        <RadioGroup
          value={fields.surfaceType}
          onValueChange={(v) => setFields({ ...fields, surfaceType: v as SurfaceType })}
        >
          {SURFACE_TYPE_OPTIONS.map((option) => (
            <div key={option.id} className="flex items-center gap-3">
              <RadioGroupItem value={option.id} id={`${idPrefix}-surface-${option.id}`} />
              <Label htmlFor={`${idPrefix}-surface-${option.id}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Shuttle type</Label>
        <RadioGroup
          value={fields.shuttleType}
          onValueChange={(v) => setFields({ ...fields, shuttleType: v as ShuttleType })}
        >
          {SHUTTLE_TYPE_OPTIONS.map((option) => (
            <div key={option.id} className="flex items-center gap-3">
              <RadioGroupItem value={option.id} id={`${idPrefix}-shuttle-${option.id}`} />
              <Label htmlFor={`${idPrefix}-shuttle-${option.id}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={fields.dropInAvailable}
            onChange={(e) => setFields({ ...fields, dropInAvailable: e.target.checked })}
          />
          Drop-in available
        </label>
        <label className="flex items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={fields.reservationRequired}
            onChange={(e) => setFields({ ...fields, reservationRequired: e.target.checked })}
          />
          Reservation required
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contactPhone`}>Contact phone</Label>
        <Input
          id={`${idPrefix}-contactPhone`}
          value={fields.contactPhone}
          onChange={(e) => setFields({ ...fields, contactPhone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contactWebsite`}>Contact website</Label>
        <Input
          id={`${idPrefix}-contactWebsite`}
          type="url"
          value={fields.contactWebsite}
          onChange={(e) => setFields({ ...fields, contactWebsite: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-bookingUrl`}>Booking URL</Label>
        <Input
          id={`${idPrefix}-bookingUrl`}
          type="url"
          value={fields.bookingUrl}
          onChange={(e) => setFields({ ...fields, bookingUrl: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Hours</Label>
        <div className="space-y-1.5">
          {fields.hours.map((day) => (
            <div key={day.dayOfWeek} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                id={`${idPrefix}-hours-${day.dayOfWeek}`}
                checked={day.isOpen}
                onChange={(e) => updateDayHours(fields, setFields, day.dayOfWeek, { isOpen: e.target.checked })}
              />
              <Label
                htmlFor={`${idPrefix}-hours-${day.dayOfWeek}`}
                className="w-24 shrink-0 font-normal"
              >
                {DAY_LABELS[day.dayOfWeek]}
              </Label>
              <TimeOfDayPicker
                value={day.openTime}
                disabled={!day.isOpen}
                ariaLabel={`${DAY_LABELS[day.dayOfWeek]} open time`}
                onChange={(openTime) => updateDayHours(fields, setFields, day.dayOfWeek, { openTime })}
              />
              <span className="text-sm text-neutral-400">–</span>
              <TimeOfDayPicker
                value={day.closeTime}
                disabled={!day.isOpen}
                ariaLabel={`${DAY_LABELS[day.dayOfWeek]} close time`}
                onChange={(closeTime) => updateDayHours(fields, setFields, day.dayOfWeek, { closeTime })}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminVenuesPanel({ accessToken }: { accessToken: string }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createFields, setCreateFields] = useState<FormFields>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<FormFields | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadVenues() {
    setIsLoading(true);
    apiGet<{ venues: Venue[] }>('/api/venues', accessToken)
      .then((res) => setVenues(res.venues))
      .catch(() => setVenues([]))
      .finally(() => setIsLoading(false));
  }

  useEffect(loadVenues, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await apiPost('/api/venues', accessToken, {
        ...toApiPayload(createFields),
        lat: Number(createFields.lat),
        lng: Number(createFields.lng),
      });
      setCreateFields(EMPTY_FORM);
      setIsCreating(false);
      loadVenues();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create venue.'));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(venue: Venue) {
    setEditingId(venue.id);
    setEditFields(toFormFields(venue));
    setError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editFields || !editingId) return;
    setError(null);
    setIsSaving(true);
    try {
      await apiPatch(`/api/venues/${editingId}`, accessToken, toApiPayload(editFields));
      setEditingId(null);
      loadVenues();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save changes.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Venues</p>
        {!isCreating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsCreating(true)}>
            Create venue
          </Button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="max-w-sm space-y-4 border-b border-border pb-6">
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <RequiredMarker /> indicates a required field
          </p>
          <VenueFormFields
            fields={createFields}
            setFields={setCreateFields}
            idPrefix="create"
            useAddressAutocomplete
            accessToken={accessToken}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Creating…' : 'Create venue'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreating(false);
                setCreateFields(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-border">
          {venues.map((venue) => (
            <li key={venue.id}>
              {editingId === venue.id && editFields ? (
                <form onSubmit={handleSaveEdit} className="max-w-sm space-y-4 py-4">
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <RequiredMarker /> indicates a required field
                  </p>
                  <VenueFormFields
                    fields={editFields}
                    setFields={setEditFields}
                    idPrefix={`edit-${venue.id}`}
                    useAddressAutocomplete={false}
                    accessToken={accessToken}
                  />
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(venue)}
                  className="-mx-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-medium">{venue.name}</p>
                    <p className="text-xs text-neutral-500">
                      {[venue.city, venue.region].filter(Boolean).join(', ')} · {venue.type}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-neutral-400" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
