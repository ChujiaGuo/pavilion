-- join_session_atomic, cancel_rsvp_and_promote, and decrement_reliability_score are
-- SECURITY DEFINER and take a bare user id with no auth.uid() check of their own —
-- all app-layer authorization (ownership, invite_only, skill gating) lives in
-- session.service.ts. Postgres grants EXECUTE to PUBLIC by default at creation time,
-- and these functions live in the `public` schema, which PostgREST exposes to the
-- Data API — so without this revoke, anon/authenticated could call
-- /rest/v1/rpc/join_session_atomic (etc.) directly with the anon key and bypass every
-- check in the service layer. Only the server's service-role client should call these.
REVOKE EXECUTE ON FUNCTION join_session_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cancel_rsvp_and_promote(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION decrement_reliability_score(uuid[], numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION join_session_atomic(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_rsvp_and_promote(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_reliability_score(uuid[], numeric) TO service_role;