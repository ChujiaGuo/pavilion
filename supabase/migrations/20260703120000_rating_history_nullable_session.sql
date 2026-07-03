-- A manual admin rating adjustment (see rating.service.ts's adminAdjustRating)
-- has no associated session, so rating_history.session_id can no longer be
-- required on every row. rating_history stays write-only/append-only audit
-- data either way — nothing reads it back to derive a live score.
ALTER TABLE rating_history ALTER COLUMN session_id DROP NOT NULL;
