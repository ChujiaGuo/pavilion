# Technical Notes

_Last updated: 2026-06-28_

See `brainstorm.md` for product/idea context. This file is for architecture, implementation, and tech decisions only.

---

## Platform

- **v1:** Responsive web app — mobile-first layout, no native app yet
- **Future:** Native iOS/Android once product is validated
- Design breakpoints should prioritize phone viewport; tablet/desktop are secondary

---

## Architecture Principles

- **Modular from the start** — marketplace is deferred but must be addable without reworking core. Keep shop/inventory/payment concerns as a clearly bounded domain, even if the code doesn't exist yet. Don't bleed session or venue logic into where marketplace would live.
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

## Session & Venue

**Paid session payment flow:**
- Collect payment or deposit at RSVP time
- 12-hour cancellation window before session start for refund
- If cancelled spot is filled from waitlist → refund the canceller regardless of timing
- We are NOT processing venue bookings — only organizer-hosted session fees

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

## Marketplace (Deferred — Architecture Flags Only)

- Treat as a separate bounded domain: `shop`, `inventory`, `listing`, `order`, `commission`
- Do not reference these concepts in `session`, `venue`, or `user` domain models
- When building user profiles, leave a clean extension point for "affiliated shop" without building it
- Payment infrastructure added for paid sessions (above) should be reusable for marketplace transactions later — choose a payment provider (e.g., Stripe) that handles both person-to-person and commerce flows
