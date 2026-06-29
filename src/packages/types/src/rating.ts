export interface RatingDisplay {
  grade: number;
  subtier: 1 | 2 | 3 | 4;
  label: string;
  isProvisional: boolean;
}

export type RelativeVote =
  | 'much_stronger'
  | 'stronger'
  | 'about_equal'
  | 'weaker'
  | 'much_weaker'
  | 'did_not_play';

export interface SessionRatingSubmission {
  sessionId: string;
  raterId: string;
  rateeId: string;
  vote: RelativeVote;
}

export interface RatingHistory {
  userId: string;
  sessionId: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  createdAt: string;
}
