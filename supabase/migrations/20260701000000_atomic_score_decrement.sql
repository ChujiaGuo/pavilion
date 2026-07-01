-- Atomically decrements reliability_score for one or more profiles,
-- clamped to 0. Using ANY(uids) means this handles both single-user
-- (cancelRsvp) and batch (markAttendance) callers in one function.
CREATE OR REPLACE FUNCTION decrement_reliability_score(uids uuid[], points numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles
  SET reliability_score = GREATEST(0, reliability_score - points)
  WHERE id = ANY(uids);
$$;