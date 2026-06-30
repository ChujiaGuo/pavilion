# Technical Notes

_Last updated: 2026-06-30_

See `brainstorm.md` for product/idea context. This file is for architecture, implementation, and tech decisions only.

See `database-schema.md` for the full table definitions.

---

## Platform

- **v1:** Responsive web app — mobile-first layout, no native app yet
- **Future:** Native iOS/Android once product is validated
- Design breakpoints should prioritize phone viewport; tablet/desktop are secondary

---

## Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (full stack) | Shared types between frontend and backend; catches domain model errors at compile time |
| Monorepo | npm workspaces (or Turborepo) | `/client` + `/server` + shared `/packages/types` in one repo |
| Frontend | Next.js | React-based, SSR/SSG, good mobile-responsive support, large ecosystem |
| Backend | Node.js + Hono (separate service) | TypeScript-first, significantly faster than Express, minimal bundle (~14kb), clean modern API — chosen over Express which has weak native TS support and slow project velocity |
| Database + Auth | Supabase (PostgreSQL) | See Supabase vs Firebase below |
| Messaging | Stream Chat | Pre-built React components, handles realtime/push/storage |
| Payments | Stripe | Handles paid sessions now, marketplace transactions later — one provider for both |
| Hosting | Railway or Render | Low ops overhead, managed Postgres option, easy to start |

---

## Supabase vs Firebase

Chose **Supabase (PostgreSQL)** over Firebase (Firestore) for the following reasons:

- **Relational data model** — users → sessions → ratings → venues are deeply relational. SQL joins are natural; Firestore requires manual denormalization and multiple round trips for the same queries.
- **Rating calculations** — weighted averages, session history, anomaly detection, distribution calibration all map cleanly to SQL. Firestore cannot do this without significant workarounds.
- **Geospatial search** — PostGIS extension gives native "venues within X miles" queries. Firebase has no equivalent. (This is the stack-choice rationale, not a status report: the schema is ready — `venues.location geography(Point,4326)` with a GIST index — but `venue.service.ts` doesn't query it yet; `listVenues` only filters by city/type/drop-in availability. Not yet implemented.)
- **Row Level Security (RLS)** — "default private" profile access enforced at the DB layer, not just application code. Harder to accidentally expose data.
- **Marketplace readiness** — inventory, orders, commissions, and transactions are relational by nature. Adding the marketplace to Postgres is natural; retrofitting Firestore is painful.
- **Open source / no vendor lock-in** — can self-host if pricing becomes an issue. Firebase is Google-only.
- **Predictable pricing** — Supabase bills by compute/storage; Firebase bills per read/write (can spike unpredictably at scale).

Firebase would win on offline-first mobile support — relevant for native apps, not for web-first v1.

---

## Architecture

**Pattern: Modular Monolith for v1**

True microservices from day one add significant operational overhead (API gateway, service discovery, inter-service communication, container orchestration, distributed tracing) before the product is validated. A modular monolith deploys as one unit but enforces strict domain boundaries internally — when the marketplace is ready to be built, it extracts cleanly as a true service.

**Domain boundaries (no cross-domain imports):**

| Domain | Responsibility |
|---|---|
| `user` | Auth, profiles, privacy settings, verification status |
| `venue` | Listings, geospatial search, discovery |
| `session` | Creation, RSVPs, scheduling, payments, shuttle calc |
| `rating` | Score calculation, history, locks, anomaly detection |
| `messaging` | Group chat (thin wrapper over Stream Chat) |
| `marketplace` | Future — extract as true microservice when built |

- **Modular from the start** — marketplace is deferred but must be addable without reworking core. Keep shop/inventory/payment concerns as a clearly bounded domain stub, even if the code doesn't exist yet.
- **No booking transactions in v1** — the app is a coordination layer. No payment flows for venue bookings; only payment flow is for paid (organizer-hosted) sessions.

---

## Rating System

Implemented in `src/server/src/domains/rating/`. Core scoring (`computeRatingUpdate`, `toRatingDisplay`) lives in `rating.algorithm.ts` — pure, no Supabase import — and is re-exported from `rating.service.ts`, which adds the DB orchestration (`submitRating`, `getRatingHistory`, etc.). The split means the algorithm is unit-testable, and runnable standalone (see `rating.demo.ts`), without a DB connection.

**Scope note:** the `verification_requests` admin approve/reject flow (submit evidence → admin review → `verified_tier`/`rating_floor` written to `profiles`) is **not yet implemented** — those columns exist and are read/respected by the scoring algorithm (see Rating locks below), but nothing in the app currently writes them. Until that flow exists, they're only settable via direct DB access.

**Duplicate-vote race:** `submitRating`'s duplicate check is an app-level pre-read of `session_rating_submissions` before insert, not a DB-level catch — `session_rating_submissions` carries `UNIQUE(session_id, rater_id, ratee_id)` as the actual backstop. Two concurrent submissions for the same vote can both pass the pre-check; the insert's `{ error }` is checked and treated as `{ reason: 'duplicate' }` specifically so the loser of that race aborts before any score-update logic runs, rather than silently double-applying the vote. Covered by `src/server/src/__integration__/rating.integration.test.ts` (see Testing below) — this scenario only reproduces against a real unique-constraint violation, not the mocked unit suite.

**Data model considerations:**
- Store raw internal score (float, 1.0–10.0+) separately from displayed tier/subtier
- Display tier is derived: `grade = floor(score)`, `subtier = round((score % 1) / 0.25) + 1` (1–4). Clamp the result to 1–4: a score near the top of a grade (e.g. `4.99`) can round up to subtier `5`, which isn't a valid subtier — clamp instead of letting it roll into the next grade
- Display label format: `"Grade {grade} — {I|II|III|IV}"` (roman numeral per subtier)
- Never expose raw float to the client — only grade + subtier label via `GET /api/ratings/user/:userId`
- **Vote attribution is never exposed**, to anyone, via the API — not even to the ratee themselves. `session_rating_submissions` (rater_id ↔ vote) is write-only through the rating domain's endpoints. `GET /api/ratings/user/:userId/history` (self-only) surfaces only the aggregated per-session `score_before/score_after/delta` from `rating_history`, never which rater(s) drove it or what they voted
- Keep full rating history per user (every session's delta) for audit, appeals, anomaly detection

**Scoring algorithm (per vote, computed and applied immediately on submission — not batched per session):**

1. Vote → offset (internal-score units): `much_stronger=+1.0, stronger=+0.5, about_equal=0, weaker=-0.5, much_weaker=-1.0`. `did_not_play` is recorded but has no scoring or familiarity effect.
2. `sessionAnchor` = average `internal_score` of all profiles with a `'going'` RSVP on the session.
3. `impliedTarget = sessionAnchor + voteOffset` — the vote asserts the ratee belongs at this point relative to the group.
4. Learning rate: `0.12` normally, `0.35` while the ratee is in placement (`placement_sessions_remaining > 0`).
5. Weight = `proWeight * calibrationWeight * familiarityWeight`:
   - **Pro weight:** rater grade `floor(raterScore) >= 8` → `1.5x`, but **only for downward/neutral votes** (`voteOffset <= 0`); upward votes from a pro get no boost (`1.0x`) — a pro can't unilaterally manufacture a rating increase, only corroborate one.
   - **Calibration weight:** if `|raterScore - rateeScore| > 2.0` grades, weight decays linearly (`-0.25` per grade over the threshold) down to a floor of `0.25` — a rater's judgment is unreliable far outside their own level.
   - **Familiarity weight (recency-adjusted):** `recencyFactor = 0.5 ^ (daysSinceLastRated / 60)` (60-day half-life, `0` if no prior pairing); `effectivePairCount = pair_count * recencyFactor`; `weight = 1 / sqrt(effectivePairCount + 1)`. Repeated *recent* pairings decay weight (the 15th game tells you little after the 5th), but a long gap resets it toward fresh — a rater's prior familiarity shouldn't keep suppressing their input if the ratee has had time to improve since.
6. `delta = learningRate * weight * (impliedTarget - rateeScore)`, clamped to `±1.0` during placement / `±0.5` otherwise (hard cap on single-vote swings).
7. `newScore = rateeScore + delta`, then: floor-clamp to `rating_floor` if set, ceiling-clamp to `7.99` if `verified_tier` is null, floor-clamp to `1.0`, round to 2 decimals. `delta` in `rating_history` is recomputed post-clamp (`newScore - rateeScore`) so the audit trail reflects what actually happened.
8. `placement_sessions_remaining` decrements once per `(session, ratee)` — on the *first* submission row for that pair, regardless of how many raters eventually submit — not once per vote.

**Anomaly detection (flag for review, not a block):**
- `session_rating_submissions.flagged = true` when `|raterScore - rateeScore| > 2.0` grades (same calibration distance used for weight decay above)
- **Out of scope / deferred:** same rater-ratee pair exceeding N sessions without fresh raters in between (partially mitigated by the recency-adjusted familiarity weight above, but not flagged), coordinated voting pattern detection, and global distribution recalibration — these need batch/cron analysis, not per-request logic

**Distribution calibration:**
- Target: slightly right-skewed normal, bulk of active users landing 3.5–4.5
- May need a global recalibration mechanism if the distribution drifts over time (e.g., grade inflation) — not implemented; would be a periodic admin/cron job, not part of the live scoring path

**Rating locks:**
- User record stores `verified_tier` (nullable) and `rating_floor` (nullable float)
- On any rating update: `new_rating = max(new_rating, rating_floor)` if floor is set
- `verified_tier` is set by admin/verification flow — not derivable from peer ratings alone (flow not yet built, see Scope note above)
- Unverified users are hard-capped at `7.99` — the algorithm simply cannot write a value ≥ 8.0 without a verified_tier on the record

**Tier-boundary protection (demotion/promotion):**
- Problem: applying every vote's delta immediately means a player hovering right at a whole-number grade boundary can flicker back and forth across it session to session. A naive fix — delay the *displayed* grade while letting raw `internal_score` keep moving underneath — just relocates the problem: when the delayed change finally lands, the score has often drifted well past the boundary, so the displayed grade can skip subtiers or even whole grades instead of landing just past the line like a real single-tier transition should.
- Fix: clamp the **raw score itself** at the grade boundary the moment a vote would cross it, instead of letting it drift while only the display lags. `profiles` stores `demotion_protection_started_at` / `promotion_protection_started_at` (both nullable timestamptz) to track this.
- Mechanism (in `computeRatingUpdate`, after the existing absolute locks — `rating_floor`, the 7.99 ceiling, `MIN_SCORE` — are applied to get the natural new score): `currentGrade = floor(rateeScore)` (the score *before* this vote).
  - **Demotion** triggers when the natural score would land `< currentGrade`. First trigger → pin at `currentGrade` exactly, start the clock. Each further sub-floor vote while the window hasn't elapsed → pin at `currentGrade` again (the clock is *not* reset per vote — it's measured from the first trend, not "consistently weak every single vote"). Once `DEMOTION_PROTECTION_WINDOW_DAYS` (7) full days have elapsed while still trending weak → release: score drops to `currentGrade - 0.01`, landing exactly at subtier IV of the grade below, never skipping.
  - **Promotion** mirrors this exactly (own state, same shape) for crossing `>= currentGrade + 1`, pinning at `currentGrade + 1 - 0.01` while protected and releasing to exactly `currentGrade + 1` (subtier I) after `PROMOTION_PROTECTION_WINDOW_DAYS` (3) full days.
  - **Windows are intentionally asymmetric** even though the mechanism is symmetric: demotion (7 days) is more generous than promotion (3 days) by design. Symmetric *mechanism* matters because demotion-only protection would make tiers easy to enter and sticky to leave — a one-way ratchet feeding the exact grade-inflation drift risk noted above. The shorter promotion window reflects that climbing should still require less sustained proof than falling gets forgiveness for.
  - **Recovery cancels immediately:** if a vote pulls the natural score back across the boundary while protected, the protection clears right away and the natural score applies as-is — no protection debt carries over.
  - **Skipped entirely during placement** (`isPlacement`) — placement explicitly wants fast convergence to true level, which this would fight.
  - A single vote, however large, can only ever pin at the boundary — it cannot blow through multiple grades in one shot. This falls out of the design rather than needing a special case.
  - Elapsed time is counted in **full calendar days, ignoring time-of-day** (e.g. 3:00pm June 1 → 2:30pm June 8 = 7 elapsed days, not 6) — deliberately coarser than, and independent of, the millisecond-precise familiarity-decay day count used elsewhere in the algorithm.
- `toRatingDisplay` needs no changes — it already derives grade/subtier from whatever `internal_score` currently holds, and a pinned or just-released score produces a correct label through the existing formula. The mechanism is entirely contained to the score-update path; protection state is never exposed via the API.

---

## Environments

Two environments: local dev (Supabase CLI) and prod (Supabase cloud + Railway/Render).

**Local dev:** `supabase start` spins up a full Postgres + Auth + Studio stack in Docker. URLs and keys are printed on startup — copy them into `src/client/.env.local` and `src/server/.env.local`. These files are gitignored.

**Prod:** env vars live in the Railway/Render dashboard only, never in files. The prod Supabase project is linked once via `supabase link --project-ref <ref>`.

**Migration workflow:**
1. `supabase migration new <name>` — scaffolds `supabase/migrations/<timestamp>_<name>.sql`
2. Write the SQL, then `supabase db reset` to replay all migrations locally and verify
3. Commit the migration file
4. `supabase db push` — applies pending migrations to the linked prod project

The remote tracks applied migrations in a `supabase_migrations` table — `db push` is idempotent and safe to run repeatedly.

**App deployment:** Railway/Render watches the repo and auto-deploys on push to `main`. No separate deploy step.

---

## Database Logic

**Venue availability lookup (two-step) — not yet implemented:** `venue.service.ts` currently returns raw `venue_hours` rows as-is (see `toVenue()`); nothing applies this lookup logic, and `venue_date_exceptions` isn't read or written anywhere in code yet (the table exists in the migration, unused). The intended logic, once built:
1. Check `venue_date_exceptions` for the exact date. If a row exists: null `open_time` means fully closed; non-null times override the regular schedule.
2. If no exception row, fall back to `venue_hours` for that `day_of_week`.

**Venue hours granularity:** `venue_hours` uses day-of-week only. "1st and 3rd Tuesday" patterns are out of scope for v1 — `venue_date_exceptions` handles one-offs, and weekly schedules cover the vast majority of real venues at launch.

**Write access for `venue_date_exceptions` (not yet implemented — no endpoint exists):** intended to be claimed venue accounts (those with `claimed_by_account_id` set) only. For unclaimed venues, platform admins only.

**Rating display derivation:** see "Rating System" above for the full formula, clamping, and label format (`toRatingDisplay` in `rating.service.ts`). Always computed server-side from `internal_score` — never expose the raw float to the client.

**Shuttle cost per person — not yet implemented:** see "Shuttle cost calculation" under Session & Venue below for the formula. `session.router.ts` is currently a stub with no service file, so nothing computes this yet.

**Admin RLS pattern:** `EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())`. Check this in any policy that gates admin-only writes.

**Verification approval action:** on approving a `verification_requests` row, write `verified_tier` and `rating_floor` to the corresponding `profiles` row. `rating_floor` is set to 6.0 regardless of the tier granted (pro floor per product rules).

**Waitlist ordering:** determined by `session_rsvps.joined_at` ascending. When a `'going'` RSVP is cancelled, promote the oldest `'waitlisted'` row for that session.

---

## Session & Venue

**Payment model (v1): no in-app payments**
- Platform is coordination-only. Organizers collect payment externally (cash, Venmo, etc.).
- No-show enforcement is social: late cancellations and no-shows affect the reliability score. Enough strikes = blocked from paid sessions.
- 12-hour cancellation window measured from session start time.
- Waitlist fills dropped spots automatically.

**Future: in-app payments via Stripe Connect**
- Stripe Connect Express accounts for organizers — money flows attendee → organizer, platform takes fee via `application_fee_amount`
- Only trigger Stripe onboarding when organizer first creates a paid session, not at signup
- Do NOT build payment infrastructure in v1 — validate session feature first

**Shuttle cost calculation (not yet implemented — `session` domain is still a router-only stub):**
- Formula: `tubes_needed = ceil((player_count / 12) * hours)`
- `shuttle_fee_per_person = (tubes_needed * tube_price) / player_count`
- Organizer inputs tube price (varies by brand/feather vs. plastic); app suggests the per-person fee

**Skill range enforcement (asymmetric):**
- Session range stored as `[min_grade, max_grade]` in decimal
- Organizer's own rating must be within ~1.5 grades of at least one end of the range they set
- Player join check is directional:
  - Playing up (player < min_grade): strict. `min_grade - player_rating > 1.5` → hard block; else → warning
  - Playing down (player > max_grade): loose. Higher threshold before hard block (TBD — e.g., 3.0 grades); warning shown at any overage but framed as informational
- Organizer receives notification when a player joins who is meaningfully above the session ceiling
- Organizer can toggle "strict range" mode to apply symmetric enforcement in both directions
- **Rating dampening for out-of-range players:** if `player_rating - session_max > threshold` (playing significantly down), exclude or heavily discount that player's ratings of others and others' ratings of them for this session. The grade gap makes the relative assessments unreliable and could unfairly penalize lower-level players. Threshold TBD — likely ~1.5 grades above ceiling.

---

## Messaging

- **v1 scope:** session-scoped group chat only (organizer + attendees). No open DMs in v1.
- **Recommended provider: Stream Chat** — pre-built React components, generous free tier, scales well. Integration measured in days not weeks. Handles real-time, push notifications, message storage, and moderation primitives.
- Alternatives: Firebase Realtime Database (more custom UI work, very cheap), Sendbird (more enterprise, pricier)
- **Channel ID convention:** Stream channel IDs are derived as `session_{session_id}`. No `stream_channel_id` column on `sessions` — the ID is always reconstructible from the session UUID, so there's nothing to store or sync.
- DM system is a future feature — keep the messaging domain cleanly separated from session domain so it can be extended

---

## Marketplace (Deferred — Architecture Flags Only)

- Treat as a separate bounded domain: `shop`, `inventory`, `listing`, `order`, `commission`
- Do not reference these concepts in `session`, `venue`, or `user` domain models
- When building user profiles, leave a clean extension point for "affiliated shop" without building it
- Payment infrastructure added for paid sessions (above) should be reusable for marketplace transactions later — choose a payment provider (e.g., Stripe) that handles both person-to-person and commerce flows
