/**
 * Walks through illustrative scenarios for the rating algorithm.
 *
 * This calls the real `computeRatingUpdate` / `toRatingDisplay` exports from
 * rating.algorithm.ts — nothing here reimplements the math, so the output
 * can't drift from the actual algorithm. See technical-notes.md "Rating
 * System" for the formula this is demonstrating.
 *
 * Run with: npx tsx src/domains/rating/rating.demo.ts
 *           (or `npm run demo:rating --workspace=server` from src/)
 */

import { computeRatingUpdate, toRatingDisplay, type ComputeRatingUpdateInput } from './rating.algorithm.js';

type Scenario = {
  name: string;
  description: string;
  input: ComputeRatingUpdateInput;
};

const scenarios: Scenario[] = [
  {
    name: 'Baseline vote',
    description: 'A fresh, well-calibrated rater votes "stronger" on a peer at the group average.',
    input: {
      vote: 'stronger',
      raterScore: 4.0,
      rateeScore: 4.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 4.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Placement session',
    description:
      'Same vote, but the ratee is still in their first 3 sessions — higher learning rate and a wider swing cap move the score faster toward their true level.',
    input: {
      vote: 'stronger',
      raterScore: 4.0,
      rateeScore: 4.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: true,
      sessionAnchor: 4.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Pro rater — downward vote (boosted)',
    description:
      'A grade-8+ rater votes "weaker" on someone near their own level. Pro judgment is trusted more for downward/neutral calls, so the weight gets a 1.5x boost. (Scores offset from a whole number so tier protection — demonstrated separately below — doesn\'t mask the comparison.)',
    input: {
      vote: 'weaker',
      raterScore: 8.3,
      rateeScore: 6.3,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 6.3,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Pro rater — upward vote (no boost)',
    description:
      'Same pro rater, same ratee, but voting "stronger" instead. A pro can\'t unilaterally manufacture a rating increase — upward votes get no boost, identical weight to a non-pro rater.',
    input: {
      vote: 'stronger',
      raterScore: 8.3,
      rateeScore: 6.3,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 6.3,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Rater far outside their calibration range',
    description:
      'A grade-8.5 rater votes "stronger" on a grade-4 player — more than 2 grades away from their own level. Their judgment at that level is unreliable, so the weight decays toward the calibration floor.',
    input: {
      vote: 'stronger',
      raterScore: 8.5,
      rateeScore: 4.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 4.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Familiar rater — sustained recent pairing',
    description:
      'The same two players have rated each other 8 times in the last day. Repeated recent pairings tell you little new, so the familiarity weight is heavily discounted.',
    input: {
      vote: 'stronger',
      raterScore: 4.0,
      rateeScore: 4.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 4.0,
      raterPriorPairCount: 8,
      raterDaysSinceLastRated: 1,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Familiar rater — returning after a long gap',
    description:
      'Same pair count (8 prior pairings), but it has been 600 days (10 half-lives) since they last rated each other. The ratee may have improved since — familiarity weight resets back toward fresh instead of staying discounted.',
    input: {
      vote: 'stronger',
      raterScore: 4.0,
      rateeScore: 4.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 4.0,
      raterPriorPairCount: 8,
      raterDaysSinceLastRated: 600,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Pro floor lock',
    description:
      'A player drifted to 5.8 before submitting verification evidence; approval just wrote rating_floor=6.0 to their profile without touching internal_score, so it briefly sits below their new floor. This is their first vote since — a weak one — showing the floor immediately pulling them back up to 6.0 rather than letting the vote push them further down. (In steady state internal_score never sits below an active floor; this models the one-vote catch-up right after verification.)',
    input: {
      vote: 'much_weaker',
      raterScore: 5.8,
      rateeScore: 5.8,
      rateeFloor: 6.0,
      rateeVerifiedTier: 8,
      isPlacement: false,
      sessionAnchor: 2.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Unverified ceiling',
    description:
      'An unverified player at the top of grade 7 gets a wave of "much stronger" votes. Organic peer ratings alone cannot push anyone into pro territory — the score is hard-capped at 7.99.',
    input: {
      vote: 'much_stronger',
      raterScore: 7.95,
      rateeScore: 7.95,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 10.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Verified player crossing into pro tier',
    description:
      'Same vote pattern, but this player has gone through verification (verified_tier set) and the 3-day promotion-protection window has already elapsed. The 7.99 ceiling no longer applies, so the score actually lands in grade 8 — unlike the unverified case above, which gets pinned at 7.99 by the ceiling even after protection releases.',
    input: {
      vote: 'much_stronger',
      raterScore: 7.95,
      rateeScore: 7.95,
      rateeFloor: null,
      rateeVerifiedTier: 8,
      isPlacement: false,
      sessionAnchor: 10.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: 3,
    },
  },
  {
    name: 'Minimum score floor',
    description:
      'A near-beginner gets a "much weaker" vote. The score can never drop below 1.0, regardless of how lopsided the votes are.',
    input: {
      vote: 'much_weaker',
      raterScore: 1.05,
      rateeScore: 1.05,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 1.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Demotion protection — pinned at the boundary',
    description:
      'A player sitting exactly at the grade 6 floor gets a weak vote that would naturally drop them into grade 5. Instead of falling through, the score is pinned at 6.00 and the protection clock starts.',
    input: {
      vote: 'weaker',
      raterScore: 6.0,
      rateeScore: 6.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 5.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Demotion protection — window elapses, releases one tier down',
    description:
      'Same player, same weak vote, but the trend has now held for the full 7-day window. Protection releases — landing exactly at subtier IV of grade 5, never skipping a subtier or a grade no matter how far the underlying votes wanted to push it.',
    input: {
      vote: 'weaker',
      raterScore: 6.0,
      rateeScore: 6.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 5.0,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: 7,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Demotion protection — recovers mid-window',
    description:
      'Same player, 4 days into demotion protection, but this session a strong vote pulls them back above the grade 6 floor. Protection cancels immediately — no debt carries over — and the natural (now-positive) score applies as-is.',
    input: {
      vote: 'stronger',
      raterScore: 6.0,
      rateeScore: 6.0,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 6.5,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: 4,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Promotion protection — pinned at the boundary',
    description:
      'A player at the top of grade 6 gets a strong vote that would naturally push them into grade 7. The score is held at 6.99 and the (shorter, 3-day) promotion clock starts.',
    input: {
      vote: 'stronger',
      raterScore: 7.0,
      rateeScore: 6.99,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 7.5,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: null,
    },
  },
  {
    name: 'Promotion protection — window elapses, releases one tier up',
    description:
      'Same player, same strong vote, but the trend has now held for the full 3-day promotion window. Protection releases — landing exactly at subtier I of grade 7.',
    input: {
      vote: 'stronger',
      raterScore: 7.0,
      rateeScore: 6.99,
      rateeFloor: null,
      rateeVerifiedTier: null,
      isPlacement: false,
      sessionAnchor: 7.5,
      raterPriorPairCount: 0,
      raterDaysSinceLastRated: null,
      demotionProtectionElapsedDays: null,
      promotionProtectionElapsedDays: 3,
    },
  },
];

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatAction(label: string, action: string): string | null {
  if (action === 'none') return null;
  return `${label} ${action}`;
}

function run() {
  console.log('Rating algorithm demo — each scenario calls the real computeRatingUpdate()\n');

  for (const { name, description, input } of scenarios) {
    const before = toRatingDisplay(input.rateeScore, input.isPlacement ? 1 : 0);
    const result = computeRatingUpdate(input);

    console.log(`=== ${name} ===`);
    console.log(description);
    console.log(
      `  rater=${formatScore(input.raterScore)}  ratee=${formatScore(input.rateeScore)}  anchor=${formatScore(
        input.sessionAnchor,
      )}  vote='${input.vote}'${input.isPlacement ? '  [placement]' : ''}` +
        (input.raterPriorPairCount > 0
          ? `  familiarity: ${input.raterPriorPairCount} prior pairings, ${input.raterDaysSinceLastRated}d ago`
          : '') +
        (input.demotionProtectionElapsedDays !== null
          ? `  demotion-protected: ${input.demotionProtectionElapsedDays}d elapsed`
          : '') +
        (input.promotionProtectionElapsedDays !== null
          ? `  promotion-protected: ${input.promotionProtectionElapsedDays}d elapsed`
          : ''),
    );

    if (!result) {
      console.log(`  -> did_not_play: no scoring effect (${before.label})\n`);
      continue;
    }

    const after = toRatingDisplay(result.newScore, input.isPlacement ? 1 : 0);
    const sign = result.delta >= 0 ? '+' : '';
    const actions = [
      formatAction('demotion protection:', result.demotionProtectionAction),
      formatAction('promotion protection:', result.promotionProtectionAction),
    ]
      .filter((a): a is string => a !== null)
      .join('  |  ');

    console.log(
      `  -> delta ${sign}${formatScore(result.delta)}  |  ${formatScore(input.rateeScore)} (${before.label}) -> ${formatScore(
        result.newScore,
      )} (${after.label})` + (actions ? `  [${actions}]` : ''),
    );
    console.log('');
  }
}

run();