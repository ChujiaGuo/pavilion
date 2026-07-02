# Database Schema

_Last updated: 2026-07-02 (added `profiles.first_name`/`last_name`, required once `verified_tier` is set; added `venues.lng`/`lat` generated columns; added `service_role` schema GRANTs — see technical-notes.md "Environments"; corrected `internal_score`'s range; added `profiles.onboarding_completed_at` and the `onboarding_quiz_responses` table (`ON DELETE CASCADE` from `profiles`) for the onboarding placement quiz — see technical-notes.md's KI-004 for why that cascade matters and where it's still missing elsewhere)_

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
| `verified_tier` | integer | nullable |
| `rating_floor` | numeric(5,2) | nullable |
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
| `role` | text | default `'admin'`. `'admin'`, `'moderator'`, `'venue_verifier'` |
| `granted_by` | uuid | nullable. FK → profiles |
| `created_at` | timestamptz | |

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
| `session_id` | uuid | FK → sessions |
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
```

---

## Excluded (by design)

- **Marketplace** — deferred. Bounded domain stub in server code only.
- **Stream Chat message data** — Stream owns storage.
- **Follower graph** — future feature.
- **In-app payments** — deferred to v2.