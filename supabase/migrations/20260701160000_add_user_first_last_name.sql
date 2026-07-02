-- Optional for unverified users; required once a user holds a verified_tier.
-- See technical-notes.md "Verification approval action".
ALTER TABLE profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_verified_requires_name CHECK (
    verified_tier IS NULL
    OR (first_name IS NOT NULL AND first_name <> '' AND last_name IS NOT NULL AND last_name <> '')
  );
