export type SessionType = 'drop_in' | 'organizer_hosted';
export type SessionFormat = 'casual_rotation' | 'king_of_the_court' | 'round_robin';
export type SessionVisibility = 'public' | 'invite_only';
export type ShuttlePolicy = 'bring_your_own' | 'split_cost' | 'provided';
export type RsvpStatus = 'going' | 'waitlisted' | 'cancelled';
export type SessionStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';

export interface Session {
  id: string;
  organizerId: string;
  venueId: string | null;
  venueName: string;
  type: SessionType;
  format: SessionFormat;
  visibility: SessionVisibility;
  skillMin: number;
  skillMax: number;
  strictRange: boolean;
  courtCount: number;
  maxPlayers: number;
  startsAt: string;
  durationMinutes: number;
  shuttlePolicy: ShuttlePolicy;
  shuttleTubePrice: number | null;
  notes: string | null;
  status: SessionStatus;
  isRecurring: boolean;
  recurringCronExpr: string | null;
  parentSessionId: string | null;
  createdAt: string;
}

export interface SessionRsvp {
  sessionId: string;
  userId: string;
  status: RsvpStatus;
  joinedAt: string;
}
