# Technical Notes

_Last updated: 2026-06-29_

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
- **Geospatial search** — PostGIS extension gives native "venues within X miles" queries. Firebase has no equivalent.
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

**Data model considerations:**
- Store raw internal score (float, 1.0–10.0+) separately from displayed tier/subtier
- Display tier is derived: `grade = floor(score)`, `subtier = round((score % 1) / 0.25) + 1` (1–4)
- Never expose raw float to the client — only grade + subtier label
- Keep full rating history per user (every session's delta) for audit, appeals, anomaly detection

**Algorithm inputs per session:**
- Group's average rating (anchor)
- Each rater's relative vote (−2 to +2: much weaker → much stronger)
- Rater's own grade (higher grade = higher weight, capped for upward boosts)
- Rater-ratee familiarity score (diminishing returns on repeated pairings)
- Placement flag (first 3 sessions = higher delta multiplier)

**Distribution calibration:**
- Target: slightly right-skewed normal, bulk of active users landing 3.5–4.5
- May need a global recalibration mechanism if the distribution drifts over time (e.g., grade inflation)
- Consider periodic anchoring: if distribution mean drifts above 5.0, apply a small correction factor

**Rating locks:**
- User record stores `verified_tier` (nullable) and `rating_floor` (nullable float)
- On any rating update: `new_rating = max(new_rating, rating_floor)` if floor is set
- `verified_tier` is set by admin/verification flow — not derivable from peer ratings alone
- Unverified users are hard-capped at `7.99` — the algorithm simply cannot write a value ≥ 8.0 without a verified_tier on the record
- Verification flow (to be designed): submit BWF ID / tournament results / credentials → admin review → tier granted → floor written to record

**Anomaly detection (flag for review):**
- Votes more than 2 grades away from rater's own calibration
- Same rater-ratee pair exceeding N sessions within a rolling window without fresh raters in between
- Coordinated voting patterns (group of users consistently voting the same direction on one person)

---

## Database Logic

**Venue availability lookup (two-step):**
1. Check `venue_date_exceptions` for the exact date. If a row exists: null `open_time` means fully closed; non-null times override the regular schedule.
2. If no exception row, fall back to `venue_hours` for that `day_of_week`.

**Venue hours granularity:** `venue_hours` uses day-of-week only. "1st and 3rd Tuesday" patterns are out of scope for v1 — `venue_date_exceptions` handles one-offs, and weekly schedules cover the vast majority of real venues at launch.

**Write access for `venue_date_exceptions`:** claimed venue accounts (those with `claimed_by_account_id` set) only. For unclaimed venues, platform admins only.

**Rating display derivation:** always computed server-side from `internal_score`. Never expose the raw float to the client.
- `grade = floor(internal_score)`
- `subtier = round((internal_score % 1) / 0.25) + 1` → integer 1–4

**Shuttle cost per person:** computed at read time, not stored. Formula: `ceil((player_count / 12) * (duration_minutes / 60)) * shuttle_tube_price / player_count`. Derives from `shuttle_tube_price` on the session, live RSVP count, and `duration_minutes`. Storing it would require keeping it in sync every time attendance changes.

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

**Shuttle cost calculation:**
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
