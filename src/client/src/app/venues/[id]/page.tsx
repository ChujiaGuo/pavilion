'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet, ApiError } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { SessionCard } from '@/components/session/session-card';
import type { Venue, Session, VenueType, SurfaceType, ShuttleType } from '@pavilion/types';

const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  club: 'Club',
  rec_center: 'Rec center',
  community_center: 'Community center',
  gym: 'Gym',
};

const SURFACE_TYPE_LABELS: Record<SurfaceType, string> = {
  synthetic_mat: 'Synthetic mat',
  wood: 'Wood',
  concrete: 'Concrete',
  outdoor: 'Outdoor',
};

const SHUTTLE_TYPE_LABELS: Record<ShuttleType, string> = {
  feather: 'Feather',
  plastic: 'Plastic',
  both: 'Both',
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(time: string): string {
  // "09:00:00" -> "9:00 AM"
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function VenueDetailPage() {
  const auth = useRequireAuth();
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<Venue | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!auth) return;

    Promise.all([
      apiGet<Venue>(`/api/venues/${venueId}`, auth.accessToken),
      apiGet<{ sessions: Session[] }>(
        `/api/sessions?venue_id=${venueId}&status=upcoming`,
        auth.accessToken,
      ).catch(() => ({ sessions: [] })),
    ])
      .then(([venueData, sessionsData]) => {
        setVenue(venueData);
        setSessions(sessionsData.sessions);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      })
      .finally(() => setIsLoading(false));
  }, [auth, venueId]);

  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Venue</p>

      {isLoading ? (
        <p className="mt-8 text-neutral-500">Loading…</p>
      ) : notFound || !venue ? (
        <p className="mt-8 text-neutral-500">This venue couldn&apos;t be found.</p>
      ) : (
        <>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{venue.name}</h1>
          <p className="mt-2 text-neutral-600">
            {VENUE_TYPE_LABELS[venue.type]} · {[venue.city, venue.region].filter(Boolean).join(', ')}
          </p>
          <p className="mt-1 text-neutral-500">{venue.address}</p>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Courts</p>
              <p className="mt-1 text-sm text-neutral-700">{venue.courtCount}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Surface</p>
              <p className="mt-1 text-sm text-neutral-700">{SURFACE_TYPE_LABELS[venue.surfaceType]}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Shuttles</p>
              <p className="mt-1 text-sm text-neutral-700">{SHUTTLE_TYPE_LABELS[venue.shuttleType]}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Booking</p>
              <p className="mt-1 text-sm text-neutral-700">
                {venue.dropInAvailable && venue.reservationRequired
                  ? 'Drop-in · Reservation required'
                  : venue.dropInAvailable
                    ? 'Drop-in available'
                    : venue.reservationRequired
                      ? 'Reservation required'
                      : '—'}
              </p>
            </div>
          </div>

          {(venue.contactPhone || venue.contactWebsite || venue.bookingUrl) && (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Contact</p>
              <div className="mt-2 space-y-1 text-sm">
                {venue.contactPhone && <p className="text-neutral-700">{venue.contactPhone}</p>}
                {venue.contactWebsite && (
                  <a
                    href={venue.contactWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-primary hover:underline"
                  >
                    Website
                  </a>
                )}
                {venue.bookingUrl && (
                  <a
                    href={venue.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-primary hover:underline"
                  >
                    Book directly with the venue
                  </a>
                )}
              </div>
            </div>
          )}

          {venue.hours.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Hours</p>
              <div className="mt-2 space-y-1 text-sm">
                {[...venue.hours]
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map((h) => (
                    <div key={h.dayOfWeek} className="flex justify-between text-neutral-700 sm:max-w-xs">
                      <span>{DAY_LABELS[h.dayOfWeek]}</span>
                      <span>
                        {formatTime(h.openTime)} – {formatTime(h.closeTime)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Upcoming sessions here</p>
            <div className="mt-2">
              {sessions.length > 0 ? (
                sessions.map((session) => <SessionCard key={session.id} session={session} />)
              ) : (
                <p className="mt-2 text-sm text-neutral-500">No upcoming sessions posted at this venue yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
