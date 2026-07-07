'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useGeolocation } from '@/lib/hooks/use-geolocation';
import { apiGet } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { VenueCard } from '@/components/venue/venue-card';
import { VenueFilters, type VenueBrowseFilters } from '@/components/venue/venue-filters';
import type { Venue } from '@pavilion/types';

const EMPTY_FILTERS: VenueBrowseFilters = { search: '', type: '', dropInOnly: false, radiusMiles: '' };

export default function VenuesPage() {
  const auth = useRequireAuth();
  const geolocation = useGeolocation();
  const [filters, setFilters] = useState<VenueBrowseFilters>(EMPTY_FILTERS);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;

    const params = new URLSearchParams();
    const search = filters.search.trim();
    if (search) params.set('name', search);
    if (filters.type) params.set('type', filters.type);
    if (filters.dropInOnly) params.set('drop_in', 'true');
    if (geolocation.status === 'granted' && geolocation.coords && filters.radiusMiles) {
      params.set('lat', String(geolocation.coords.lat));
      params.set('lng', String(geolocation.coords.lng));
      params.set('radius_miles', filters.radiusMiles);
    }

    setIsLoading(true);
    apiGet<{ venues: Venue[] }>(`/api/venues?${params.toString()}`, auth.accessToken)
      .then((res) => setVenues(res.venues))
      .catch(() => setVenues([]))
      .finally(() => setIsLoading(false));
  }, [auth, filters, geolocation.status, geolocation.coords]);

  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Venues</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Nearby venues</h1>

      <div className="mt-8">
        <VenueFilters
          value={filters}
          geolocationStatus={geolocation.status}
          onRequestLocation={geolocation.request}
          onApply={setFilters}
        />
      </div>

      <div className="mt-8">
        {isLoading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : venues.length > 0 ? (
          <div>
            {venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">No venues match these filters.</p>
        )}
      </div>
    </AppShell>
  );
}
