# Database Schema

_Last updated: 2026-07-13 (added `admin_session_edits`' `'remove_rsvp'` action, written by the new moderator+ `DELETE /api/sessions/:id/rsvps/:userId` endpoint — see technical-notes.md "Admin & Roles")_

PostgreSQL via Supabase. PostGIS extension enabled.

See `technical-notes.md` for lookup logic, derivation formulas, and access control rules.

---

## Tables

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → auth.users |
| `display_name` | text | |
| `first_name` | text | nullable. Required if `verified_tier` is set — enforced by `profiles_verified_requires_name` CHECK constraint |
| `last_name` | text | nullable. Same requirement as `first_name` |
| `photo_url` | text | nullable |
| `city` | text | |
| `region` | text | Labeled "State" in the profile edit UI (`src/client/src/app/profile/page.tsx`) — column name unchanged since `region` stays the more general term product-wise (see brainstorm.md's deferred "Regional rating calibration"), it's just presented as "State" for the current US-first launch |
| `preferred_formats` | text[] | `'singles'`, `'doubles'`, `'mixed'` |
| `play_style` | text | `'competitive'`, `'social'`, `'training'` |
| `privacy_level` | text | `'private'`, `'public'` — default `'private'` |
| `internal_score` | numeric(5,2) | 1.00–10+, intentionally unbounded above 10 (elite tier has no ceiling) |
| `verified_tier` | integer | nullable. Set via `PATCH /api/users/:id/verify` (admin+) — see technical-notes.md "Verification approval action" |
| `rating_floor` | numeric(5,2) | nullable. Always 6.0 when `verified_tier` is set, regardless of tier — see technical-notes.md "Verification approval action" |
| `reliability_score` | numeric(5,2) | default 100 |
| `placement_sessions_remaining` | integer | default 3 |
| `demotion_protection_started_at` | timestamptz | nullable. Set when a vote first trends the player below their current grade's floor; cleared on recovery or release |
| `promotion_protection_started_at` | timestamptz | nullable. Same as above, for trending at/above the next grade's ceiling |
| `session_count` | integer | default 0 |
| `onboarding_completed_at` | timestamptz | nullable. Set when the onboarding placement quiz is submitted or skipped — null means the user is prompted on next login. See technical-notes.md "Onboarding placement quiz" |
| `deleted_at` | timestamptz | nullable. Soft delete — null means active. |
| `created_at` | timestamptz | |

---

### `admins`

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK → profiles |
| `role` | text | default `'admin'`. `'venue_verifier'`, `'moderator'`, `'admin'`, `'owner'` — ranked in that order, a higher role can do everything a lower one can. No CHECK constraint — enforced app-side only (`src/server/src/lib/admin.ts`), same convention as `session_rsvps.status` |
| `granted_by` | uuid | nullable. FK → profiles |
| `created_at` | timestamptz | |

---

### `admin_role_changes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `target_user_id` | uuid | FK → profiles |
| `old_role` | text | nullable. Null means the target had no role before this change |
| `new_role` | text | nullable. Null means the role was removed |
| `changed_by` | uuid | FK → profiles |
| `created_at` | timestamptz | |

Audit trail — mirrors why `rating_history`/`onboarding_quiz_responses` exist. Written by `PATCH`/`DELETE /api/admin/roles/:userId`. Read back, along with the three tables below and the admin-adjustment `rating_history` rows, by `GET /api/admin/history` (the unified History tab) — see technical-notes.md "Admin & Roles".

---

### `admin_user_edits`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `target_user_id` | uuid | FK → profiles |
| `performed_by` | uuid | FK → profiles |
| `changes` | jsonb | nullable. Array of `{ field, before, after }` — one entry per patched field (camelCase `User` field names, e.g. `displayName`), only for fields actually present in the request body. Null if the pre-update fetch failed to find a "before" row (shouldn't happen in practice) |
| `created_at` | timestamptz | |

Audit trail for moderator+ profile edits (`PATCH /api/users/:id` when the caller isn't the profile owner). No `action` column — profile edit is this domain's only admin-override action. Two FKs to `profiles` — needs `!<fkey_name>` embed disambiguation, same as `admins`/`admin_role_changes`. Self-edits are never logged here. See technical-notes.md "Admin & Roles".

---

### `admin_session_edits`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid | FK → sessions |
| `performed_by` | uuid | FK → profiles |
| `action` | text | `'edit'`, `'cancel'`, `'advance_status'`, `'mark_attendance'`, `'remove_rsvp'`. No CHECK constraint — same app-layer-enforced-enum convention as `admins.role` |
| `changes` | jsonb | nullable. Array of `{ field, before, after }`. `edit`: one entry per patched `Session` field. `cancel`/`advance_status`: a single synthetic `status` entry (e.g. `upcoming` → `active`). `mark_attendance`: synthetic `attended`/`noShows` entries (`before: null`, `after: <count>` — there's no prior count to diff against). `remove_rsvp`: synthetic `removedUserId`/`rsvpStatus` entries |
| `created_at` | timestamptz | |

Audit trail for moderator+ session overrides (`updateSession`/`cancelSession`/`progressSessionStatus`/`markAttendance` in `session.service.ts`, only on the branch that skips the organizer-ownership check). Organizer self-actions are never logged here. See technical-notes.md "Admin & Roles".

---

### `admin_venue_edits`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `venue_id` | uuid | FK → venues |
| `performed_by` | uuid | FK → profiles |
| `action` | text | `'create'`, `'edit'`. No CHECK constraint, same convention as above |
| `changes` | jsonb | nullable. Array of `{ field, before, after }`, one per patched `Venue` field. Always null for `create` — there's no "before" state for a new row |
| `created_at` | timestamptz | |

Audit trail for venue_verifier+ venue writes. `createVenue` always logs (venue_verifier+ is already required to call it at all); `updateVenue` logs only on the admin branch, not the claimed-owner branch. See technical-notes.md "Admin & Roles".

---

### `venues`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `type` | text | `'club'`, `'rec_center'`, `'community_center'`, `'gym'` |
| `address` | text | |
| `city` | text | |
| `region` | text | |
| `location` | geography(Point, 4326) | Source of truth for the point. Not read directly by app code — see `lng`/`lat` below |
| `lng` | double precision | generated, `ST_X(location::geometry)`. PostgREST returns `geography` columns as an EWKB hex string, not `{ coordinates: [...] }` — `venue.service.ts` reads this generated column instead of parsing the wire format |
| `lat` | double precision | generated, `ST_Y(location::geometry)` |
| `court_count` | integer | |
| `surface_type` | text | `'synthetic_mat'`, `'wood'`, `'concrete'`, `'outdoor'` |
| `shuttle_type` | text | `'feather'`, `'plastic'`, `'both'` |
| `drop_in_available` | boolean | |
| `reservation_required` | boolean | |
| `contact_phone` | text | nullable |
| `contact_website` | text | nullable |
| `booking_url` | text | nullable |
| `claimed_by_account_id` | uuid | nullable. FK → profiles |
| `created_at` | timestamptz | |

---

### `venue_hours`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `venue_id` | uuid | FK → venues |
| `day_of_week` | integer | 0 = Sunday … 6 = Saturday |
| `open_time` | time | |
| `close_time` | time | |

---

### `venue_date_exceptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `venue_id` | uuid | FK → venues |
| `date` | date | |
| `open_time` | time | nullable. null = fully closed |
| `close_time` | time | nullable. null = fully closed |
| `reason` | text | nullable |
| `created_at` | timestamptz | |

UNIQUE `(venue_id, date)`.

---

### `venue_edit_suggestions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `venue_id` | uuid | FK → venues |
| `submitted_by` | uuid | FK → profiles |
| `field_name` | text | |
| `suggested_value` | text | |
| `status` | text | default `'pending'`. `'pending'`, `'accepted'`, `'rejected'` |
| `created_at` | timestamptz | |

---

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organizer_id` | uuid | FK → profiles |
| `venue_id` | uuid | nullable. FK → venues |
| `venue_name` | text | |
| `type` | text | `'drop_in'`, `'organizer_hosted'` |
| `format` | text | `'casual_rotation'`, `'king_of_the_court'`, `'round_robin'` |
| `visibility` | text | `'public'`, `'invite_only'` |
| `skill_min` | numeric(4,2) | |
| `skill_max` | numeric(4,2) | |
| `strict_range` | boolean | default false |
| `court_count` | integer | |
| `max_players` | integer | |
| `starts_at` | timestamptz | |
| `duration_minutes` | integer | |
| `shuttle_policy` | text | `'bring_your_own'`, `'split_cost'`, `'provided'` |
| `shuttle_tube_price` | numeric(6,2) | nullable |
| `notes` | text | nullable |
| `status` | text | default `'upcoming'`. `'upcoming'`, `'active'`, `'completed'`, `'cancelled'` |
| `is_recurring` | boolean | default false |
| `recurring_cron_expr` | text | nullable |
| `parent_session_id` | uuid | nullable. FK → sessions |
| `created_at` | timestamptz | |

---

### `session_rsvps`

| Column | Type | Notes |
|---|---|---|
| `session_id` | uuid | FK → sessions |
| `user_id` | uuid | FK → profiles |
| `status` | text | `'going'`, `'waitlisted'`, `'cancelled'`, `'attended'`, `'no_show'`. No DB-level CHECK constraint — enforced at the app layer (`RsvpStatus` in `@pavilion/types`) |
| `joined_at` | timestamptz | |

Composite PK `(session_id, user_id)`.

---

### `session_rating_submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid | FK → sessions |
| `rater_id` | uuid | FK → profiles |
| `ratee_id` | uuid | FK → profiles |
| `vote` | text | `'much_stronger'`, `'stronger'`, `'about_equal'`, `'weaker'`, `'much_weaker'`, `'did_not_play'` |
| `flagged` | boolean | default false |
| `created_at` | timestamptz | |

UNIQUE `(session_id, rater_id, ratee_id)`.

---

### `rating_history`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → profiles |
| `session_id` | uuid | nullable. FK → sessions. Null for an admin-initiated manual rating adjustment (`POST /api/ratings/user/:userId/adjust`), which has no associated session — see technical-notes.md "Admin & Roles" |
| `performed_by` | uuid | nullable. FK → profiles. Set only on the `session_id IS NULL` (admin-adjustment) rows — the admin who made the adjustment. Null on peer-vote rows. Two FKs to `profiles` (`user_id`, `performed_by`) — needs the same `!<fkey_name>` embed disambiguation as `admins`/`admin_role_changes` when both sides are queried together (see "Admin & Roles" below) |
| `score_before` | numeric(5,2) | |
| `score_after` | numeric(5,2) | |
| `delta` | numeric(5,2) | |
| `created_at` | timestamptz | |

---

### `rater_familiarity`

| Column | Type | Notes |
|---|---|---|
| `rater_id` | uuid | FK → profiles |
| `ratee_id` | uuid | FK → profiles |
| `pair_count` | integer | default 1 |
| `last_rated_at` | timestamptz | |

Composite PK `(rater_id, ratee_id)`.

---

### `onboarding_quiz_responses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → profiles |
| `answers` | jsonb | nullable. Null when the user skipped instead of answering |
| `computed_score` | numeric(5,2) | the resulting `internal_score` written to `profiles` at submission time |
| `skipped` | boolean | default false |
| `created_at` | timestamptz | |

UNIQUE `(user_id)`. Audit trail only — mirrors why `rating_history` exists for peer votes. Not read by any endpoint; write-only via the onboarding submit/skip flow. See technical-notes.md "Onboarding placement quiz".

---

### `verification_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → profiles |
| `requested_tier` | integer | 8, 9, or 10 |
| `evidence_urls` | text[] | |
| `status` | text | default `'pending'`. `'pending'`, `'approved'`, `'rejected'` |
| `reviewed_by` | uuid | nullable. FK → admins.user_id |
| `reviewer_notes` | text | nullable |
| `created_at` | timestamptz | |
| `reviewed_at` | timestamptz | nullable |

---

## Indexes

```sql
CREATE INDEX ON venues USING GIST (location);
CREATE INDEX ON sessions (status, starts_at);
CREATE INDEX ON session_rsvps (session_id, status);
CREATE INDEX ON rating_history (user_id, created_at DESC);
CREATE INDEX ON rater_familiarity (rater_id, ratee_id);
CREATE INDEX ON session_rating_submissions (flagged) WHERE flagged = true;
CREATE INDEX ON admin_user_edits (created_at DESC);
CREATE INDEX ON admin_session_edits (created_at DESC);
CREATE INDEX ON admin_venue_edits (created_at DESC);
```

No index on `admin_role_changes` — lowest-volume of the four audit tables (role grants/revokes happen far less often than profile/session/venue edits or rating adjustments), so a sequential scan on `created_at` is fine at this scale. Revisit if that assumption stops holding.

---

## Excluded (by design)

- **Marketplace** — deferred. Bounded domain stub in server code only.
- **Stream Chat message data** — Stream owns storage.
- **Follower graph** — future feature.
- **In-app payments** — deferred to v2.