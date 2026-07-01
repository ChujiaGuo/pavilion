-- cancel_rsvp_and_promote previously promoted the oldest waitlisted user regardless
-- of session status. If a user cancelled their RSVP on a session that had already
-- moved to 'cancelled' or 'completed', the RPC would still flip a waitlisted row to
-- 'going' — a phantom RSVP that could later earn that user a no-show penalty.
--
-- Fix: read the session's status under the same FOR UPDATE lock and only promote
-- when it's 'upcoming' or 'active'. The cancel itself still always happens.
CREATE OR REPLACE FUNCTION cancel_rsvp_and_promote(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status text;
  v_session_status text;
BEGIN
  SELECT status INTO v_session_status FROM sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_rsvped';
  END IF;

  SELECT status INTO v_old_status
  FROM session_rsvps
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND status IN ('going', 'waitlisted');

  IF NOT FOUND THEN
    RETURN 'not_rsvped';
  END IF;

  UPDATE session_rsvps
  SET status = 'cancelled'
  WHERE session_id = p_session_id AND user_id = p_user_id;

  IF v_old_status = 'going' AND v_session_status IN ('upcoming', 'active') THEN
    UPDATE session_rsvps
    SET status = 'going'
    WHERE (session_id, user_id) = (
      SELECT session_id, user_id
      FROM session_rsvps
      WHERE session_id = p_session_id AND status = 'waitlisted'
      ORDER BY joined_at ASC
      LIMIT 1
    );
  END IF;

  RETURN v_old_status;
END;
$$;