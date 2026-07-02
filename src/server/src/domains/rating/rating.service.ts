import { supabase } from '../../lib/supabase.js';
import type { RatingDisplay, RatingHistory, RelativeVote } from '@pavilion/types';
import {
  computeRatingUpdate,
  toRatingDisplay,
  computeOnboardingScore,
  SKIP_DEFAULT_SCORE,
  ANOMALY_CALIBRATION_THRESHOLD,
  type TierProtectionAction,
  type OnboardingAnswers,
} from './rating.algorithm.js';

export {
  computeRatingUpdate,
  toRatingDisplay,
  type ComputeRatingUpdateInput,
  type ComputeRatingUpdateResult,
  type TierProtectionAction,
} from './rating.algorithm.js';

/**
 * Full calendar days between two dates, ignoring time-of-day — e.g. 3:00pm
 * June 1 to 2:30pm June 8 is 7 elapsed days, not 6. Deliberately coarser than
 * the millisecond-precise familiarity-decay day count below.
 */
export function fullDaysElapsed(since: Date, now: Date): number {
  const sinceUTC = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((nowUTC - sinceUTC) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type RatingHistoryRow = {
  user_id: string;
  session_id: string;
  score_before: number;
  score_after: number;
  delta: number;
  created_at: string;
};

function toRatingHistory(row: RatingHistoryRow): RatingHistory {
  return {
    userId: row.user_id,
    sessionId: row.session_id,
    scoreBefore: row.score_before,
    scoreAfter: row.score_after,
    delta: row.delta,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getUserRatingDisplay(userId: string, requesterId: string): Promise<RatingDisplay | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('internal_score, placement_sessions_remaining, privacy_level')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  if (data.privacy_level === 'private' && userId !== requesterId) return null;
  return toRatingDisplay(data.internal_score, data.placement_sessions_remaining);
}

export async function getRatingHistory(userId: string): Promise<RatingHistory[]> {
  const { data, error } = await supabase
    .from('rating_history')
    .select('user_id, session_id, score_before, score_after, delta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as RatingHistoryRow[]).map(toRatingHistory);
}

// ---------------------------------------------------------------------------
// Submit a vote
// ---------------------------------------------------------------------------

export type SubmitRatingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'invalid_vote'
        | 'self_rating'
        | 'duplicate'
        | 'not_participant'
        | 'not_found'
        | 'session_not_eligible';
    };

const VALID_VOTES: RelativeVote[] = [
  'much_stronger',
  'stronger',
  'about_equal',
  'weaker',
  'much_weaker',
  'did_not_play',
];

export async function submitRating(
  raterId: string,
  sessionId: string,
  rateeId: string,
  vote: RelativeVote,
): Promise<SubmitRatingResult> {
  if (!VALID_VOTES.includes(vote)) return { ok: false, reason: 'invalid_vote' };
  if (raterId === rateeId) return { ok: false, reason: 'self_rating' };

  const { data: session } = await supabase
    .from('sessions')
    .select('starts_at, status')
    .eq('id', sessionId)
    .single();

  if (!session) return { ok: false, reason: 'not_found' };
  if (session.status === 'cancelled' || new Date(session.starts_at) > new Date()) {
    return { ok: false, reason: 'session_not_eligible' };
  }

  const { data: existingSubmissions } = await supabase
    .from('session_rating_submissions')
    .select('rater_id')
    .eq('session_id', sessionId)
    .eq('ratee_id', rateeId);

  const submissionRows = existingSubmissions ?? [];
  if (submissionRows.some((r) => r.rater_id === raterId)) {
    return { ok: false, reason: 'duplicate' };
  }
  const isFirstSubmissionForRateeInSession = submissionRows.length === 0;

  const { data: rsvps } = await supabase
    .from('session_rsvps')
    .select('user_id, status')
    .eq('session_id', sessionId)
    .in('user_id', [raterId, rateeId]);

  const goingIds = new Set((rsvps ?? []).filter((r) => r.status === 'going').map((r) => r.user_id));
  if (!goingIds.has(raterId) || !goingIds.has(rateeId)) {
    return { ok: false, reason: 'not_participant' };
  }

  const { data: raterProfile } = await supabase
    .from('profiles')
    .select('internal_score')
    .eq('id', raterId)
    .is('deleted_at', null)
    .single();

  const { data: rateeProfile } = await supabase
    .from('profiles')
    .select(
      'internal_score, rating_floor, verified_tier, placement_sessions_remaining, demotion_protection_started_at, promotion_protection_started_at',
    )
    .eq('id', rateeId)
    .is('deleted_at', null)
    .single();

  if (!raterProfile || !rateeProfile) return { ok: false, reason: 'not_found' };

  const raterScore = raterProfile.internal_score as number;
  const rateeScore = rateeProfile.internal_score as number;
  const rateeFloor = rateeProfile.rating_floor as number | null;
  const rateeVerifiedTier = rateeProfile.verified_tier as number | null;
  const placementSessionsRemaining = rateeProfile.placement_sessions_remaining as number;

  const now = new Date();
  const demotionProtectionElapsedDays = rateeProfile.demotion_protection_started_at
    ? fullDaysElapsed(new Date(rateeProfile.demotion_protection_started_at), now)
    : null;
  const promotionProtectionElapsedDays = rateeProfile.promotion_protection_started_at
    ? fullDaysElapsed(new Date(rateeProfile.promotion_protection_started_at), now)
    : null;

  const flagged = Math.abs(raterScore - rateeScore) > ANOMALY_CALIBRATION_THRESHOLD;

  const { error: insertError } = await supabase.from('session_rating_submissions').insert({
    session_id: sessionId,
    rater_id: raterId,
    ratee_id: rateeId,
    vote,
    flagged,
  });

  // A concurrent submission can win the unique-constraint race even after
  // passing the pre-check above — without this, the score update below would
  // still apply on top of a vote that was never actually recorded.
  if (insertError) return { ok: false, reason: 'duplicate' };

  if (vote === 'did_not_play') {
    if (isFirstSubmissionForRateeInSession) {
      await supabase
        .from('profiles')
        .update({ placement_sessions_remaining: Math.max(placementSessionsRemaining - 1, 0) })
        .eq('id', rateeId);
    }
    return { ok: true };
  }

  const { data: familiarityRow } = await supabase
    .from('rater_familiarity')
    .select('pair_count, last_rated_at')
    .eq('rater_id', raterId)
    .eq('ratee_id', rateeId)
    .maybeSingle();

  const priorPairCount = familiarityRow?.pair_count ?? 0;
  const daysSinceLastRated = familiarityRow?.last_rated_at
    ? (Date.now() - new Date(familiarityRow.last_rated_at).getTime()) / (1000 * 60 * 60 * 24)
    : null;

  await supabase.from('rater_familiarity').upsert(
    {
      rater_id: raterId,
      ratee_id: rateeId,
      pair_count: priorPairCount + 1,
      last_rated_at: new Date().toISOString(),
    },
    { onConflict: 'rater_id,ratee_id' },
  );

  const { data: goingRsvps } = await supabase
    .from('session_rsvps')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('status', 'going');

  const goingUserIds = (goingRsvps ?? []).map((r) => r.user_id);
  const { data: goingProfiles } = await supabase
    .from('profiles')
    .select('internal_score')
    .in('id', goingUserIds.length > 0 ? goingUserIds : [rateeId]);

  const anchorScores = (goingProfiles ?? []).map((p) => p.internal_score as number);
  const sessionAnchor =
    anchorScores.length > 0 ? anchorScores.reduce((sum, s) => sum + s, 0) / anchorScores.length : rateeScore;

  const update = computeRatingUpdate({
    vote,
    raterScore,
    rateeScore,
    rateeFloor,
    rateeVerifiedTier,
    isPlacement: placementSessionsRemaining > 0,
    sessionAnchor,
    raterPriorPairCount: priorPairCount,
    raterDaysSinceLastRated: daysSinceLastRated,
    demotionProtectionElapsedDays,
    promotionProtectionElapsedDays,
  });

  if (!update) return { ok: true };

  const newPlacementRemaining = isFirstSubmissionForRateeInSession
    ? Math.max(placementSessionsRemaining - 1, 0)
    : placementSessionsRemaining;

  const profileUpdates: Record<string, unknown> = {
    internal_score: update.newScore,
    placement_sessions_remaining: newPlacementRemaining,
  };
  if (update.demotionProtectionAction === 'start') {
    profileUpdates.demotion_protection_started_at = now.toISOString();
  } else if (update.demotionProtectionAction === 'release' || update.demotionProtectionAction === 'cancel') {
    profileUpdates.demotion_protection_started_at = null;
  } // 'continue' / 'none' — leave the stored timestamp untouched
  if (update.promotionProtectionAction === 'start') {
    profileUpdates.promotion_protection_started_at = now.toISOString();
  } else if (update.promotionProtectionAction === 'release' || update.promotionProtectionAction === 'cancel') {
    profileUpdates.promotion_protection_started_at = null;
  } // 'continue' / 'none' — leave the stored timestamp untouched

  await supabase.from('profiles').update(profileUpdates).eq('id', rateeId);

  await supabase.from('rating_history').insert({
    user_id: rateeId,
    session_id: sessionId,
    score_before: rateeScore,
    score_after: update.newScore,
    delta: update.delta,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Onboarding placement quiz
// ---------------------------------------------------------------------------

export type OnboardingResult =
  | { ok: true; rating: RatingDisplay }
  | { ok: false; reason: 'invalid_answers' | 'already_completed' };

/**
 * Shared write path for both the quiz submission and the skip action: an
 * atomic claim-style UPDATE (same pattern as `claimVenue` in venue.service.ts)
 * so a 0-row result means onboarding was already completed, including races
 * against a concurrent submit/skip from another tab. The audit insert and the
 * app_metadata mirror (see technical-notes.md "Onboarding placement quiz" for
 * why the mirror exists) are best-effort once the profile row has committed —
 * `profiles.onboarding_completed_at` is the only source of truth.
 */
async function completeOnboarding(
  userId: string,
  score: number,
  audit: { answers: OnboardingAnswers | null; skipped: boolean },
): Promise<OnboardingResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ internal_score: score, onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('onboarding_completed_at', null)
    .is('deleted_at', null)
    .select('placement_sessions_remaining')
    .single();

  if (error || !data) return { ok: false, reason: 'already_completed' };

  const { error: auditError } = await supabase.from('onboarding_quiz_responses').insert({
    user_id: userId,
    answers: audit.answers,
    computed_score: score,
    skipped: audit.skipped,
  });
  if (auditError) {
    console.error(`completeOnboarding: audit insert failed for user ${userId}`, auditError);
  }

  const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { onboarding_completed: true },
  });
  if (metadataError) {
    console.error(`completeOnboarding: app_metadata sync failed for user ${userId}`, metadataError);
  }

  return {
    ok: true,
    rating: toRatingDisplay(score, data.placement_sessions_remaining as number),
  };
}

export async function submitOnboardingQuiz(userId: string, answers: OnboardingAnswers): Promise<OnboardingResult> {
  const score = computeOnboardingScore(answers);
  if (score === null) return { ok: false, reason: 'invalid_answers' };
  return completeOnboarding(userId, score, { answers, skipped: false });
}

export async function skipOnboarding(userId: string): Promise<OnboardingResult> {
  return completeOnboarding(userId, SKIP_DEFAULT_SCORE, { answers: null, skipped: true });
}