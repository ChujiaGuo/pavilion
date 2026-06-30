-- Tier-boundary demotion/promotion protection state for the rating algorithm.
-- See technical-notes.md "Rating System" for the mechanism.
ALTER TABLE profiles
  ADD COLUMN demotion_protection_started_at timestamptz,
  ADD COLUMN promotion_protection_started_at timestamptz;