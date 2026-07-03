-- Backstops session.service.ts's app-level skillMin < skillMax check with a DB
-- constraint. The app-level check alone is a read-then-write race: two
-- concurrent PATCH /:id requests each patching only one side of the range can
-- both read the same pre-update pair and pass validation independently, then
-- commit an inverted range. The constraint makes the invariant atomic
-- regardless of how many concurrent writers there are.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_skill_range_valid CHECK (skill_min < skill_max);
