-- Audit trail for role grants/revocations, mirroring why rating_history /
-- onboarding_quiz_responses exist. old_role/new_role are plain text with no
-- CHECK constraint, same app-layer-enforced-enum convention as admins.role
-- and session_rsvps.status. Write-only for now — no dedicated read endpoint
-- until a real need for one shows up (same precedent as
-- onboarding_quiz_responses).
CREATE TABLE admin_role_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES profiles(id),
  old_role       text,
  new_role       text,
  changed_by     uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
