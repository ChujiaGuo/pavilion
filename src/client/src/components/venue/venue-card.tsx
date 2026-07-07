import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Venue } from '@pavilion/types';

const VENUE_TYPE_LABELS: Record<Venue['type'], string> = {
  club: 'Club',
  rec_center: 'Rec center',
  community_center: 'Community center',
  gym: 'Gym',
};

// Editorial list-item style (no bounding box) -- mirrors SessionCard exactly
// (session-card.tsx) so the two discovery surfaces read as one visual
// system. Hover + chevron affordance matches the admin panel's row
// convention (admin-venues-panel.tsx).
export function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Link
      href={`/venues/${venue.id}`}
      className="-mx-2 flex items-center justify-between gap-3 rounded-lg border-b border-border px-2 py-4 transition-colors first:pt-0 last:border-b-0 hover:bg-muted"
    >
      <div>
        <p className="font-medium">{venue.name}</p>
        <p className="mt-0.5 text-sm text-neutral-600">
          {VENUE_TYPE_LABELS[venue.type]} · {[venue.city, venue.region].filter(Boolean).join(', ')}
          {venue.distanceMiles !== undefined && ` · ${venue.distanceMiles.toFixed(1)} mi away`}
        </p>
        {(venue.dropInAvailable || venue.reservationRequired) && (
          <p className="mt-1 text-sm text-neutral-500">
            {[venue.dropInAvailable && 'Drop-in available', venue.reservationRequired && 'Reservation required']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-neutral-400" />
    </Link>
  );
}
