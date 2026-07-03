-- Reverses the original "no before/after diffs" decision for the admin
-- History tab (see technical-notes.md "Admin & Roles") — entries now carry
-- the actual field-level before/after values, not just an action label.
-- Nullable: 'create' venue edits and 'mark_attendance' session edits don't
-- have a natural single-field diff, so they leave this null.
ALTER TABLE admin_user_edits ADD COLUMN changes jsonb;
ALTER TABLE admin_session_edits ADD COLUMN changes jsonb;
ALTER TABLE admin_venue_edits ADD COLUMN changes jsonb;
