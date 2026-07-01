-- Atomically decides capacity and inserts/updates the RSVP in one transaction.
-- FOR UPDATE on the sessions row serializes concurrent joins: two callers racing
-- for the last slot cannot both read the same going count and both get 'going'.
CREATE OR REPLACE FUNCTION join_session_atomic(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_players integer;
  v_going_count integer;
  v_rsvp_status text;
BEGIN
  SELECT max_players INTO v_max_players
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT COUNT(*) INTO v_going_count
  FROM session_rsvps
  WHERE session_id = p_session_id AND status = 'going';

  v_rsvp_status := CASE WHEN v_going_count < v_max_players THEN 'going' ELSE 'waitlisted' END;

  INSERT INTO session_rsvps (session_id, user_id, status, joined_at)
  VALUES (p_session_id, p_user_id, v_rsvp_status, NOW())
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET status = v_rsvp_status, joined_at = NOW();

  RETURN v_rsvp_status;
END;
$$;

-- Atomically cancels an RSVP and promotes the next waitlisted user in one
-- transaction. FOR UPDATE on the sessions row serializes all concurrent
-- cancellations for the same session, preserving strict FIFO waitlist order
-- even when two users cancel simultaneously.
--
-- Why not SKIP LOCKED on the waitlist row? If a concurrent transaction holding
-- the lock rolled back, SKIP LOCKED would have already promoted a lower-priority
-- user, permanently breaking FIFO order. Serializing via the session row avoids
-- this: transaction B simply waits, then sees the post-commit waitlist state.
CREATE OR REPLACE FUNCTION cancel_rsvp_and_promote(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status text;
BEGIN
  PERFORM id FROM sessions WHERE id = p_session_id FOR UPDATE;

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

  IF v_old_status = 'going' THEN
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
