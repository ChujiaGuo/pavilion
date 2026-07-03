'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
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
};

function toFormFields(venue: Venue): FormFields {
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
  };
}

function VenueFormFields({
  fields,
  setFields,
  idPrefix,
  includeLatLng,
}: {
  fields: FormFields;
  setFields: (fields: FormFields) => void;
  idPrefix: string;
  includeLatLng: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={fields.name}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
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
        <Label htmlFor={`${idPrefix}-address`}>Address</Label>
        <Input
          id={`${idPrefix}-address`}
          value={fields.address}
          onChange={(e) => setFields({ ...fields, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input
            id={`${idPrefix}-city`}
            value={fields.city}
            onChange={(e) => setFields({ ...fields, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-region`}>State</Label>
          <Input
            id={`${idPrefix}-region`}
            value={fields.region}
            onChange={(e) => setFields({ ...fields, region: e.target.value })}
          />
        </div>
      </div>

      {includeLatLng && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
            <Input
              id={`${idPrefix}-lat`}
              type="number"
              step="any"
              value={fields.lat}
              onChange={(e) => setFields({ ...fields, lat: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-lng`}>Longitude</Label>
            <Input
              id={`${idPrefix}-lng`}
              type="number"
              step="any"
              value={fields.lng}
              onChange={(e) => setFields({ ...fields, lng: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-courtCount`}>Court count</Label>
        <Input
          id={`${idPrefix}-courtCount`}
          type="number"
          min="1"
          value={fields.courtCount}
          onChange={(e) => setFields({ ...fields, courtCount: e.target.value })}
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
        ...createFields,
        lat: Number(createFields.lat),
        lng: Number(createFields.lng),
        courtCount: Number(createFields.courtCount),
      });
      setCreateFields(EMPTY_FORM);
      setIsCreating(false);
      loadVenues();
    } catch {
      setError('Failed to create venue.');
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
      const { lat, lng, ...updatable } = editFields;
      void lat;
      void lng;
      await apiPatch(`/api/venues/${editingId}`, accessToken, {
        ...updatable,
        courtCount: Number(updatable.courtCount),
      });
      setEditingId(null);
      loadVenues();
    } catch {
      setError('Failed to save changes.');
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
          <VenueFormFields fields={createFields} setFields={setCreateFields} idPrefix="create" includeLatLng />
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
                  <VenueFormFields
                    fields={editFields}
                    setFields={setEditFields}
                    idPrefix={`edit-${venue.id}`}
                    includeLatLng={false}
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
