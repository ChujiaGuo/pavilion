-- Onboarding placement quiz: gate column + audit trail of quiz submissions/skips.
ALTER TABLE profiles
  ADD COLUMN onboarding_completed_at timestamptz;

CREATE TABLE onboarding_quiz_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers         jsonb,
  computed_score  numeric(5,2) NOT NULL,
  skipped         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
