import type { RatingDisplay, RelativeVote } from '@pavilion/types';

// ---------------------------------------------------------------------------
// Pure rating math — no I/O. See technical-notes.md "Rating System" for the
// rationale behind these constants. Kept dependency-free (no Supabase import)
// so it can be unit-tested and demoed without a DB connection.
// ---------------------------------------------------------------------------

const VOTE_OFFSETS: Record<RelativeVote, number | null> = {
  much_stronger: 1.0,
  stronger: 0.5,
  about_equal: 0,
  weaker: -0.5,
  much_weaker: -1.0,
  did_not_play: null,
};

const BASE_LEARNING_RATE = 0.12;
const PLACEMENT_LEARNING_RATE = 0.35;
const PRO_GRADE_THRESHOLD = 8;
const PRO_WEIGHT_MULTIPLIER = 1.5;
const CALIBRATION_DISTANCE_THRESHOLD = 2.0;
const CALIBRATION_DECAY_PER_GRADE = 0.25;
const CALIBRATION_MIN_WEIGHT = 0.25;
const FAMILIARITY_HALF_LIFE_DAYS = 60;
const MAX_SWING_PLACEMENT = 1.0;
const MAX_SWING_NORMAL = 0.5;
const UNVERIFIED_CEILING = 7.99;
const MIN_SCORE = 1.0;
const DEMOTION_PROTECTION_WINDOW_DAYS = 7;
const PROMOTION_PROTECTION_WINDOW_DAYS = 3;

export const ANOMALY_CALIBRATION_THRESHOLD = 2.0;

const SUBTIER_ROMAN = ['I', 'II', 'III', 'IV'] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calibrationWeight(distance: number): number {
  if (distance <= CALIBRATION_DISTANCE_THRESHOLD) return 1;
  const over = distance - CALIBRATION_DISTANCE_THRESHOLD;
  return clamp(1 - CALIBRATION_DECAY_PER_GRADE * over, CALIBRATION_MIN_WEIGHT, 1);
}

function familiarityWeight(priorPairCount: number, daysSinceLastRated: number | null): number {
  const recencyFactor =
    daysSinceLastRated === null ? 0 : Math.pow(0.5, daysSinceLastRated / FAMILIARITY_HALF_LIFE_DAYS);
  const effectivePairCount = priorPairCount * recencyFactor;
  return 1 / Math.sqrt(effectivePairCount + 1);
}

function proWeight(raterScore: number, voteOffset: number): number {
  const raterGrade = Math.floor(raterScore);
  if (raterGrade >= PRO_GRADE_THRESHOLD && voteOffset <= 0) return PRO_WEIGHT_MULTIPLIER;
  return 1;
}

// ---------------------------------------------------------------------------
// Tier-boundary protection — a vote that would cross a whole-number grade
// boundary doesn't move the score past it immediately. Instead the score is
// pinned at the boundary while the trend holds; if it holds for the full
// window, the tier change locks in landing exactly one subtier past the
// boundary (never skipping). A vote that pulls the score back across the
// boundary mid-window cancels the protection immediately. Skipped entirely
// during placement, which wants fast convergence instead.
//
// Demotion and promotion use the same state machine but different window
// lengths (demotion is more generous — see technical-notes.md).
// ---------------------------------------------------------------------------

export type TierProtectionAction = 'start' | 'continue' | 'release' | 'cancel' | 'none';

type TierProtectionResult = {
  newScore: number;
  demotionProtectionAction: TierProtectionAction;
  promotionProtectionAction: TierProtectionAction;
};

function applyTierProtection(params: {
  naturalScore: number;
  rateeScore: number;
  isPlacement: boolean;
  demotionProtectionElapsedDays: number | null;
  promotionProtectionElapsedDays: number | null;
}): TierProtectionResult {
  const { naturalScore, rateeScore, isPlacement, demotionProtectionElapsedDays, promotionProtectionElapsedDays } =
    params;

  if (isPlacement) {
    return { newScore: naturalScore, demotionProtectionAction: 'none', promotionProtectionAction: 'none' };
  }

  const currentGrade = Math.floor(rateeScore);

  // Grade 1 is the absolute floor of the scale (MIN_SCORE) — there's no grade
  // below it to protect against, so demotion protection never triggers there.
  if (naturalScore < currentGrade && currentGrade > 1) {
    if (demotionProtectionElapsedDays === null) {
      return { newScore: currentGrade, demotionProtectionAction: 'start', promotionProtectionAction: 'none' };
    }
    if (demotionProtectionElapsedDays >= DEMOTION_PROTECTION_WINDOW_DAYS) {
      return { newScore: currentGrade - 0.01, demotionProtectionAction: 'release', promotionProtectionAction: 'none' };
    }
    return { newScore: currentGrade, demotionProtectionAction: 'continue', promotionProtectionAction: 'none' };
  }

  if (naturalScore >= currentGrade + 1) {
    if (promotionProtectionElapsedDays === null) {
      return {
        newScore: currentGrade + 1 - 0.01,
        demotionProtectionAction: 'none',
        promotionProtectionAction: 'start',
      };
    }
    if (promotionProtectionElapsedDays >= PROMOTION_PROTECTION_WINDOW_DAYS) {
      return { newScore: currentGrade + 1, demotionProtectionAction: 'none', promotionProtectionAction: 'release' };
    }
    return {
      newScore: currentGrade + 1 - 0.01,
      demotionProtectionAction: 'none',
      promotionProtectionAction: 'continue',
    };
  }

  return {
    newScore: naturalScore,
    demotionProtectionAction: demotionProtectionElapsedDays !== null ? 'cancel' : 'none',
    promotionProtectionAction: promotionProtectionElapsedDays !== null ? 'cancel' : 'none',
  };
}

export type ComputeRatingUpdateInput = {
  vote: RelativeVote;
  raterScore: number;
  rateeScore: number;
  rateeFloor: number | null;
  rateeVerifiedTier: number | null;
  isPlacement: boolean;
  sessionAnchor: number;
  raterPriorPairCount: number;
  raterDaysSinceLastRated: number | null;
  /** Full calendar days since this player first trended below their current grade's floor, or null if not currently protected. */
  demotionProtectionElapsedDays: number | null;
  /** Full calendar days since this player first trended at/above their current grade's ceiling, or null if not currently protected. */
  promotionProtectionElapsedDays: number | null;
};

export type ComputeRatingUpdateResult = {
  delta: number;
  newScore: number;
  demotionProtectionAction: TierProtectionAction;
  promotionProtectionAction: TierProtectionAction;
};

export function computeRatingUpdate(input: ComputeRatingUpdateInput): ComputeRatingUpdateResult | null {
  const voteOffset = VOTE_OFFSETS[input.vote];
  if (voteOffset === null) return null; // did_not_play — no scoring effect

  const impliedTarget = input.sessionAnchor + voteOffset;
  const learningRate = input.isPlacement ? PLACEMENT_LEARNING_RATE : BASE_LEARNING_RATE;
  const weight =
    proWeight(input.raterScore, voteOffset) *
    calibrationWeight(Math.abs(input.raterScore - input.rateeScore)) *
    familiarityWeight(input.raterPriorPairCount, input.raterDaysSinceLastRated);

  const maxSwing = input.isPlacement ? MAX_SWING_PLACEMENT : MAX_SWING_NORMAL;
  const rawDelta = clamp(learningRate * weight * (impliedTarget - input.rateeScore), -maxSwing, maxSwing);

  // Tier protection evaluates the vote's own organic trajectory — *before* the
  // absolute locks below. Otherwise a rating_floor (or unverified-ceiling)
  // clamp that happens to land past a grade line would look like an organic
  // crossing and get pinned by protection, defeating the floor/ceiling's
  // unconditional guarantee. The locks are re-applied after, as the final
  // word, overriding whatever protection decided.
  const organicScore = input.rateeScore + rawDelta;

  const { newScore: protectedScore, demotionProtectionAction, promotionProtectionAction } = applyTierProtection({
    naturalScore: organicScore,
    rateeScore: input.rateeScore,
    isPlacement: input.isPlacement,
    demotionProtectionElapsedDays: input.demotionProtectionElapsedDays,
    promotionProtectionElapsedDays: input.promotionProtectionElapsedDays,
  });

  let naturalScore = protectedScore;
  if (input.rateeFloor !== null) naturalScore = Math.max(naturalScore, input.rateeFloor);
  if (input.rateeVerifiedTier === null) naturalScore = Math.min(naturalScore, UNVERIFIED_CEILING);
  naturalScore = Math.max(naturalScore, MIN_SCORE);

  const newScore = Math.round(naturalScore * 100) / 100;

  return {
    delta: Math.round((newScore - input.rateeScore) * 100) / 100,
    newScore,
    demotionProtectionAction,
    promotionProtectionAction,
  };
}

// ---------------------------------------------------------------------------
// Onboarding placement quiz — self-reported answers produce a provisional
// initial score. Same idea as the peer-vote scoring above (pure, no I/O,
// unit-testable), but a straight average rather than a learning-rate walk
// since there's no prior score to move relative to.
//
// Calibration is approximate, same caveat as the "Distribution calibration"
// note in technical-notes.md — revisit via the (already deferred) global
// recalibration job if drift shows up, not by hand-tuning this table later.
// ---------------------------------------------------------------------------

export const AVERAGE_RATING_ANCHOR = 3.5;
export const SKIP_DEFAULT_SCORE = 2.75; // one grade below the anchor

export type OnboardingQuestionId =
  | 'highest_level_played'
  | 'strongest_opponents'
  | 'competitive_history'
  | 'play_frequency';

export type OnboardingAnswers = Record<OnboardingQuestionId, string>;

const ONBOARDING_QUESTION_IDS: OnboardingQuestionId[] = [
  'highest_level_played',
  'strongest_opponents',
  'competitive_history',
  'play_frequency',
];

const ONBOARDING_OPTION_SCORES: Record<OnboardingQuestionId, Record<string, number>> = {
  highest_level_played: {
    never_played: 1.0,
    casual_pickup: 2.25,
    club_league: 3.75,
    regional_tournament: 5.5,
    national_or_above: 7.0,
  },
  strongest_opponents: {
    beginners: 1.0,
    recreational_players: 2.25,
    competitive_club: 3.75,
    regional_tournament_players: 5.5,
    national_or_pro: 7.0,
  },
  competitive_history: {
    none: 1.5,
    local_casual: 2.75,
    regional_sanctioned: 4.5,
    national: 6.5,
  },
  play_frequency: {
    rarely: 1.5,
    monthly: 2.5,
    weekly: 3.25,
    multiple_weekly: 4.0,
  },
};

/**
 * Averages the 4 self-reported answers into a provisional initial score.
 * Returns null if any required question is missing or its answer isn't a
 * recognized option id — since this is an average, a missing/garbage key
 * would silently skew the result rather than erroring like a straight sum.
 */
export function computeOnboardingScore(answers: OnboardingAnswers): number | null {
  const values: number[] = [];
  for (const questionId of ONBOARDING_QUESTION_IDS) {
    const answer = answers[questionId];
    if (typeof answer !== 'string') return null;
    const score = ONBOARDING_OPTION_SCORES[questionId][answer];
    if (score === undefined) return null;
    values.push(score);
  }

  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const clamped = clamp(average, MIN_SCORE, UNVERIFIED_CEILING);
  return Math.round(clamped * 100) / 100;
}

export function toRatingDisplay(
  internalScore: number,
  placementSessionsRemaining: number,
  verifiedTier: number | null = null,
): RatingDisplay {
  const grade = Math.floor(internalScore);
  const subtierIndex = clamp(Math.floor((internalScore % 1) / 0.25), 0, 3);
  const subtier = (subtierIndex + 1) as 1 | 2 | 3 | 4;

  return {
    grade,
    subtier,
    label: `Grade ${grade} — ${SUBTIER_ROMAN[subtierIndex]}`,
    isProvisional: placementSessionsRemaining > 0,
    // Flags as soon as the last subtier of the unverified ceiling's grade is
    // reached (e.g. Grade 7 — IV), not just once the score is clamped exactly
    // at UNVERIFIED_CEILING — a player sitting at 7.8 is just as stuck as one
    // pinned at 7.99, since peer ratings alone can't move them into grade 8.
    atUnverifiedCeiling: verifiedTier === null && grade === Math.floor(UNVERIFIED_CEILING) && subtier === 4,
  };
}