export type PrivacyLevel = 'private' | 'public';
export type PlayFormat = 'singles' | 'doubles' | 'mixed';
export type PlayStyle = 'competitive' | 'social' | 'training';

export interface User {
  id: string;
  displayName: string;
  photoUrl: string | null;
  city: string;
  region: string;
  preferredFormats: PlayFormat[];
  playStyle: PlayStyle;
  privacyLevel: PrivacyLevel;
  verifiedTier: number | null;
  ratingFloor: number | null;
  createdAt: string;
}

export interface UserProfile extends User {
  rating: RatingDisplay;
  reliabilityScore: number;
  sessionCount: number;
}

import type { RatingDisplay } from './rating.js';
