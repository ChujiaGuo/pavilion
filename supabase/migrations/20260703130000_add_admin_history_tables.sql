-- Unified admin History tab (see technical-notes.md "Admin & Roles").
--
-- rating_history has no column recording who performed a manual admin rating
-- adjustment (session_id IS NULL rows) — add one so those entries have an
-- actor, same as every other history entry type. Nullable since existing
-- rows (and peer-vote rows, which always have a real session_id) predate it.
ALTER TABLE rating_history ADD COLUMN performed_by uuid REFERENCES profiles(id);

-- Three new append-only audit tables, one per domain whose admin-override
-- actions weren't previously tracked. Same conventions as admin_role_changes:
-- no CHECK constraint on `action` (app-layer enforced enum, like
-- admins.role/session_rsvps.status), write-only until this feature adds a
-- read path (listAdminHistory in admin.service.ts).

CREATE TABLE admin_user_edits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid NOT NULL REFERENCES profiles(id),
  performed_by    uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_session_edits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id),
  performed_by uuid NOT NULL REFERENCES profiles(id),
  action       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_venue_edits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES venues(id),
  performed_by uuid NOT NULL REFERENCES profiles(id),
  action       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON admin_user_edits (created_at DESC);
CREATE INDEX ON admin_session_edits (created_at DESC);
CREATE INDEX ON admin_venue_edits (created_at DESC);
