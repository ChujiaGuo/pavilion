export type VenueType = 'club' | 'rec_center' | 'community_center' | 'gym';
export type SurfaceType = 'synthetic_mat' | 'wood' | 'concrete' | 'outdoor';
export type ShuttleType = 'feather' | 'plastic' | 'both';

export interface VenueHours {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openTime: string;
  closeTime: string;
}

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  courtCount: number;
  surfaceType: SurfaceType;
  shuttleType: ShuttleType;
  dropInAvailable: boolean;
  reservationRequired: boolean;
  contactPhone: string | null;
  contactWebsite: string | null;
  bookingUrl: string | null;
  hours: VenueHours[];
  claimedByAccountId: string | null;
  createdAt: string;
}
