# Pavilion — Brainstorm Notes

_Last updated: 2026-07-02_

---

## Problem Statement

Drop-in badminton in the US is unstructured: mismatched skill levels, uncoordinated play, and no easy way to find courts or players of similar ability. No central platform exists for the badminton community to self-organize around sessions, venues, or gear.

---

## Core Pillars

### 1. Venue Discovery

**What it does:** Map-based listing of local places to play badminton.

**Venue types:**
- Community centers (drop-in, often pay-per-session)
- Badminton clubs (membership, court reservations)
- Rec centers, gyms with shared courts
- Outdoor courts (seasonal)

**Data per venue:**
- Location, hours, pricing
- Drop-in availability vs. reservation required
- Number of courts, surface type (synthetic mat, wood, concrete — matters for safety/play)
- Shuttle type used (feather vs. plastic — club vs. casual)
- Contact info + direct booking link (players book with the venue themselves — we don't handle the transaction)
- User reviews and photos

**Booking model — important:** The app is a *coordination layer*, not a booking layer. A player plans a session a week out, others commit to attending, and everyone books directly with the venue on their own. We never touch the booking transaction. This keeps us out of payment processing, liability, and venue integration complexity.

**Two types of sessions:**
- *Free drop-in* (rec center open play, etc.): no money changes hands through the app. Primary purpose is coordination — players can see who's planning to attend, group themselves by skill, and show up knowing who's there. Booking with the venue is still handled independently.
- *Paid/private rental* (organizer rented the space): the app is still coordination-only — no in-app payments in v1. Organizer collects however they prefer (cash, Venmo, etc.). Commitment is enforced socially via the reliability score — enough no-shows and a player is blocked from paid sessions.

**Shuttle cost:**
- Standard rule of thumb: ~1 tube (12 birds) per 12 players per hour
- Organizer specifies shuttle policy when posting: bring your own, split cost, or provided. For free drop-ins, organizer can also collect birds from participants at the start.
- Auto-calculating and displaying a suggested per-person shuttle contribution (player count × duration → tube count → cost split) is deferred — see Future Features Roadmap. v1 just stores the policy and an organizer-entered tube price; no computed suggestion yet.

**Session options:**
- Format: casual rotation, king of the court, round robin (organizer picks)
- Visibility: public (discoverable in listings) vs. invite-only (hidden from public listings, but anyone with the session link/ID can still view and join — v1 has no allowlist mechanism)
- Court count drives max capacity: e.g. 3 courts = 12 players (or up to 16 with rotation)
- Recurring sessions: weekly/biweekly repeat so organizers don't re-post manually

**Cancellation policy:**
- 12-hour window measured from session start time — cancel before that and your reliability score is unaffected; cancel after (or no-show) and it counts against you
- Waitlist fills spots automatically when someone drops out

**Free drop-in as the habit-forming entry point:**
- Highest-volume use case; builds the daily/weekly habit that makes ratings and marketplace valuable
- "I'm going to Thursday drop-in" one-tap RSVP should be the lowest-friction flow in the app
- Get this right and everything else follows

**Advertising for clubs/venues:**
- Clubs and community centers can pay for featured/promoted placement in venue listings
- Sponsored "session suggestions" (e.g., "Club X is hosting open play this Saturday — join")
- Banner or card ads within the venue detail page
- Low friction for venues — just pay for visibility, no integration required

**Venue data maintenance:**
- Two venue types: clubs/dedicated courts (stable hours) and rec centers (specific scheduled times). Both can be listed.
- **Venue account type:** venues can claim their listing and manage their own hours directly.
- **Suggest an edit:** any user can flag incorrect info. If enough edits are suggested for a venue that hasn't claimed its listing, the venue is notified and prompted to take ownership.
- Unofficial venues (church gym, school gymnasium): the session organizer posts it directly — they own the session, not the venue. No venue listing needed.
- Venue detail pages show contact info + direct booking link (phone/website). We don't deep-link into external booking systems.

---

### 2. Skill Rating System

**Onboarding / initial rating — implemented:**
- Self-reported via a short quiz, prompted after signup or on first login if not yet done: highest level played, strongest opponents faced, competitive history, frequency of play. ("Self-assessed weaknesses" was cut from v1's quiz — it's diagnostic rather than a skill-level signal, and no feature reads it yet; see "self-assessed weaknesses" in the Future Features Roadmap if a consumer for it materializes.)
- Produces a provisional placement rating that carries low weight; see technical-notes.md "Onboarding placement quiz" for the scoring formula
- Optional — skipping applies a fixed default score one grade below the calibration target (see technical-notes.md for the exact value) rather than blocking account use
- First 3 sessions are *placement matches*: rating shifts faster (higher learning rate / larger delta multiplier) to get the player to their true level quickly, then stabilizes. This applies identically whether the initial score came from the quiz or the skip default.
- After placement, normal weighting kicks in

**Pickleball DUPR reference:**
- Scale 2.0–8.0 with fine decimals, match-result based (wins/losses + score margin), both players must confirm a match
- Public and transparent — main drawback is people obsess over tiny decimal movements, and sandbagging is easy since it's purely results-based
- Our system differs: peer judgment of relative skill rather than match scores — better suited to casual/social play where scores aren't always tracked

**Rating scale: 1.0–10.0+ with decimal subtiers**

| Grade | Description |
|-------|-------------|
| 1 | Complete beginner — learning rules and how to hit |
| 2 | Beginner — can rally, basic serves, plays casually |
| 3 | Recreational — consistent rallies, developing footwork |
| 4 | Intermediate-low — smashing, basic tactics, casual league play |
| 5 | Intermediate-high — competitive club level, tactical awareness |
| 6 | Advanced club — strong in all strokes, plays competitive leagues |
| 7 | Competitive club / regional — tournament-level, state/regional contender |
| 8 | Elite amateur — national juniors, college varsity, national circuit |
| 9 | Semi-pro / emerging pro — national team fringes, low-tier pro circuits |
| 10 | Professional — BWF circuit, ranked professional |
| 10+ | Elite professional — BWF top 50–100 worldwide |

Expanding to 10 (from the original 8) gives meaningful separation in the advanced and elite amateur tiers (7–10), where there's actually a large skill gap being compressed.

**Subtier system — 4 subtiers per grade at 0.25 increments:**
- Internally: 1.00, 1.25, 1.50, 1.75 → 2.00, 2.25... and so on
- Displayed to users as a grade + subtier label, exact number hidden (e.g., "Grade 4 — III" or "4★★★☆")
- Every 0.25 movement = promotion/demotion to next subtier
- Hides obsession over micro-decimal swings (the main DUPR complaint), while still giving meaningful progression feedback

**Post-session rating mechanic:**
- After a session, each player rates others relative to the group:
  - *Much stronger / Stronger / About equal / Weaker / Much weaker / Didn't play*
- The group's average rating is the anchor. Each relative vote translates to a delta from that anchor.
- Simple for users — relative comparison is easier and more accurate than picking an absolute number

**Diminishing returns from repeated pairings:**
- If the same set of people rate each other session after session, their influence on each other's rating decays over time (like repeated chess games against the same opponent — the 15th game tells you little you didn't already know after the 5th)
- Prevents tight friend groups or regular Thursday crews from inflating or anchoring each other's scores indefinitely
- Fresh raters (someone who hasn't played with you before) carry more weight

**Pro player weighting (grades 8/9/10):**
- High-grade players' relative assessments carry more weight — their judgment is better calibrated, especially for distinguishing players in the mid-to-upper range
- But capped: a pro's vote alone cannot push someone's rating significantly upward. A boost requires corroboration from the broader group. (A pro can identify talent, but can't unilaterally manufacture it)
- Asymmetric: pro downward assessments ("much weaker") are more credible and carry fuller weight than upward ones ("much stronger") — prevents a pro friend from rating-boosting someone

**Rating locks and verification gates:**
- **Pro floor (grades 8–10):** once a player is verified at pro level, their rating has a hard floor — they can never drop below advanced club level (grade 6.0) regardless of peer ratings. An off-session or playing down shouldn't erase a career of elite play.
- **Pro ceiling gate:** organic peer ratings alone cannot push a player into grade 8 or above. Reaching the pro tier requires external verification — e.g., BWF player ID, documented tournament results, national ranking, or club/coach endorsement. This prevents friend-group inflation from manufacturing fake pros.
- **Unverified ceiling:** players without verification cap out at the top of grade 7 (elite amateur). They can be excellent, but "pro" is a verified status.
- Verification is a one-time process per tier; once granted, the floor locks in permanently (even if the player is inactive for years)
- **Verification prompt UX:** a player who organically reaches the 7.75–7.99 range should be prompted in-app to submit verification credentials — otherwise they hit an invisible ceiling with no path forward. The prompt should explain what verification requires and what unlocks.
- **Tier-boundary protection:** crossing a whole-number grade line (e.g. 6.0 → 5.x) isn't instant — a player has to trend weaker (or stronger, for promotion) for a sustained window before the tier actually changes, rather than flickering across the line session to session. Demotion gets a generous 7-day window (a slump shouldn't tank you); promotion gets a shorter 3-day window — deliberately asymmetric in length, but applied to *both* directions, so the system doesn't become a one-way ratchet where tiers are easy to enter and sticky to leave. See technical-notes.md for the mechanism.

**Safeguards against manipulation:**
- Ratings far outside a rater's own calibration carry less weight (e.g., a 3.0 player calling a 7.0 "about equal" — their judgment at that level is unreliable)
- After placement, hard caps on single-session rating swings
- Reporting system for suspected sandbagging or coordinated manipulation
- Sandbagging is naturally self-correcting: badminton skill is hard to convincingly suppress over multiple sessions with different groups; community ratings catch it over time

**Session skill range enforcement (decimal-aware, asymmetric):**
- Organizer sets the skill range for a session (e.g., 3.0–5.0)
- Organizer cannot set a range more than ~1.5 levels outside their own rating — prevents a 3.0 from running an elite 6.5–8.0 session they can't properly manage
- Player joining — asymmetric rules:
  - **Playing up** (player is below the session floor): stricter. >1.5 grades below floor → hard block; ≤1.5 → warning. Lower-level players in a high-level session can't keep up and hurt everyone's experience.
  - **Playing down** (player is above the session ceiling): looser. Higher-level players can control their own game, and advanced/elite players are rare enough that strict downward limits would effectively strand them. Wider threshold before a block; warning shown but framed differently ("you're above this session's level — joining anyway?")
  - Organizer always retains the right to block anyone manually or restrict the session to exact range only
  - When a significantly higher-rated player joins, organizer gets a notification so they're not blindsided
  - **Rating impact dampening:** when a high-level player joins a session well below their grade, cross-grade ratings are excluded or heavily discounted from the algorithm. A grade 8 dominating a grade 3–5 session shouldn't drag down lower-level players' scores — the skill gap makes those comparisons meaningless.

**Rating distribution — target shape:**
- Slightly right-skewed normal curve (long tail toward the elite end, thin tail at the beginner end)
- Beginners (grades 1–2) will be underrepresented: they're unlikely to find the app or play frequently enough to accumulate ratings
- Bulk of the user base expected in grades 3–5 (recreational to intermediate-high)
- Grades 6–10 form the right tail — smaller population, but important for the community's credibility
- System calibration should anchor "average active user" around grade 3.5–4.5
- The subtier system should feel meaningful in the 3–6 range where most movement happens

Regional rating calibration and separate singles/doubles ratings are both deferred — see Future Features Roadmap.

---

## User Profiles

**Core identity:**
- Display name, photo, location (city/region level — not exact address)
- Legal first/last name — optional at signup, but required once a player is pro-tier verified (see "Rating locks and verification gates" below); distinct from the display name, and currently follows the same visibility rule as the rest of the profile (not specially hidden — revisit if that turns out to be too exposed for a legal name)
- Rating grade + subtier (shown as label, not raw number)
- Verified badge if pro-tier verified
- Preferred format (singles, doubles, mixed doubles)
- Preferred play style / session type (competitive, social, training)

**Credibility signals:**
- Session history — how many sessions attended, reliability score (show/no-show rate)
- How long they've been on the platform
- Rating shown as current grade + subtier only — no trajectory direction displayed. Showing a declining trajectory would discourage others from playing with someone and undermine fair access. Everyone gets a fair chance.
- Sportsmanship/reliability score separate from skill rating (ties into the no-show concern)

**Discovery / social:**
- Venues they frequent (so others can find regular players at their spot)
- Upcoming sessions they're attending (if opted into public)
- Ability to follow players — useful for "I want to know when this person is playing next"

**Privacy — default private, opt-in public:**
- All profile fields default to private — only a player's name/display name is visible to anyone who's shared a session with them (e.g., in an attendee list); the actual profile page itself stays private unless they opt in
- Players opt in to making their profile, session attendance, and venue activity publicly visible
- Location is always city/region level maximum — never exact

**Messaging:**
- v1: session-scoped group chat only (organizer + attendees). Bounded by session context, avoids open DM moderation surface area.
- Built on a third-party service (Stream Chat preferred — see technical notes) rather than from scratch
- Direct player-to-player messaging is a future feature

---

## Marketplace (Deferred — fully deferred feature, version TBD)

Do not build in v1. Architecture should be modular enough to add without major rework — see `CLAUDE.md`'s domain-boundary rule (don't add marketplace concepts to `session`/`venue`/`user`, even as optional fields).

**Problem it solves:** Pro shop inventory in the US is inconsistent and hard to find. Players often don't know what's locally available.

**Features:**
- Local pro shops list their inventory (rackets, shuttlecocks, shoes, strings, grips, bags, apparel)
- Real-time or near-real-time stock status
- Local pickup or local shipping
- Commission model: app takes % of each transaction (e.g., 8–12%)
- String job bookings (extremely common — serious players restring frequently)
- Racket demo/rental programs (try-before-you-buy)

**Differentiation from Amazon:** local availability + community trust + specialist expertise. Not competing on commodity items — competing on the experience and the relationship.

**Architecture considerations for when this gets built:**
- When building user profiles, leave a clean extension point for "affiliated shop" without building it now
- The payment provider chosen for in-app session payments (see Future Features Roadmap) should be reusable for marketplace transactions later — pick one (e.g., Stripe) that handles both person-to-person and commerce flows, rather than bolting on a second provider when marketplace gets built

**Open questions:**
- Do we handle payments in-app or redirect to shop's own checkout?
- Fulfillment layer or discovery layer?

---

## Future Features Roadmap

Everything not in MVP Scope (v1) below lives here. `technical-notes.md` only documents implemented features and features ready to be built in the current version — anything deferred gets tracked here instead, with a version once one's assigned.

| Feature | Description | Version |
|---|---|---|
| In-app payments for paid sessions | Platform escrow model: collect payment at RSVP, hold until session, release to organizer. Requires Stripe Connect (Express accounts) — organizers onboard with identity + banking info. Forfeited deposits on late cancel/no-show go to organizer automatically. Waitlist spot-transfer: canceller retains their payment, waitlister pays canceller directly for the spot. | v2 |
| Shuttle cost auto-calculation | Suggested per-person shuttle contribution computed from player count × duration → tube count → cost split (`tubes_needed = ceil((player_count / 12) * hours)`, `shuttle_fee_per_person = (tubes_needed * tube_price) / player_count`). Informational only, no in-app payment. v1 still has the raw `shuttle_policy`/`shuttle_tube_price` fields — only the computed suggestion is deferred. | TBD |
| Marketplace | Full commerce platform — see dedicated section below. | TBD |
| Leagues & Tournaments | Ladder leagues within a venue or city, round-robin bracket tool, club admins manage rosters/schedules. | TBD |
| Coach Discovery | Verified coaches list rates/availability/specialties, book lessons in-app, coach verification ties into the existing rating/verification system. | TBD |
| Direct Messaging | Player-to-player DMs (v1 only has session-scoped group chat). | TBD |
| Follower graph | Follow players to know when they're playing next. | TBD |
| Singles vs. doubles separate rating | A great singles player isn't always a great doubles player — separate ratings per format. (Previously noted as "probably v2" — unconfirmed.) | TBD |
| Regional rating calibration | A "4.5" in a major metro badminton hub may differ from a "4.5" in a smaller market. | TBD |
| Global rating distribution recalibration | Periodic admin/cron job to correct distribution drift (e.g. grade inflation) if it occurs over time. Not part of the live per-vote scoring path. | TBD |
| Coordinated voting / anomaly batch detection | Same rater-ratee pair exceeding N sessions without fresh raters in between, coordinated voting pattern detection across accounts. Needs batch/cron analysis, not per-request logic. Partially mitigated today by the recency-adjusted familiarity weight, but not flagged. | TBD |
| Venue edit-suggestion auto-notify | If enough edits are suggested for a venue that hasn't claimed its listing, notify the venue and prompt them to take ownership. `submitEditSuggestion` currently just inserts a row — no threshold or notification logic exists yet. | TBD |
| Self-assessed weaknesses in onboarding quiz | Cut from v1's onboarding quiz — diagnostic rather than a skill-level signal, and nothing reads it yet. Worth adding back if a coaching/matching feature emerges that could consume it (e.g. Coach Discovery). | TBD |
| CSP violation reporting endpoint | Collect `Content-Security-Policy-Report-Only` violation reports (`report-uri`/`report-to`) instead of relying on manual devtools QA during the report-only rollout. See technical-notes.md "Security Headers". | TBD |
| CAPTCHA on signup/password-reset | hCaptcha or Turnstile via `supabase/config.toml`'s `[auth.captcha]` (currently commented out) — would close the gap that per-IP-only `[auth.rate_limit]` tuning can't (an attacker distributing attempts across many IPs). Needs a provider chosen and a site/secret key pair created — external-service decision, not something to do unilaterally. See technical-notes.md "Auth". | TBD |

---

## Monetization Levers

| Revenue Stream | Notes |
|---|---|
| Marketplace commission | Primary long-term revenue (deferred) |
| Club/venue advertising | Featured placement, sponsored session posts — low friction, no booking integration needed |
| Premium player subscriptions | Advanced analytics, priority session access |
| Club/organization subscriptions | Admin tools, league management, branding |

---

## Go-to-Market Thoughts

- **Start local and dense** — pick 1–2 cities with active badminton communities (e.g., a city with a large Southeast/East Asian population where badminton culture is strongest)
- **Seed with venues first** — get a handful of community centers and clubs listed before launch
- **Player seeding** — partner with a local club to onboard their members; gives the rating system real data immediately
- **Chicken-and-egg on marketplace** — approach pro shops as a free listing first, commission only on sales, low risk for them

---

## Key Risks

- **Cold start on ratings** — system has no value until enough players are rated
- **Geographic density** — thin in areas without badminton culture
- **Rating gaming / social dynamics** — friend groups inflating each other, revenge downvoting
- **Venue data staleness** — hours change, courts close. Partially mitigated by venue account type (venues manage their own data) and suggest-an-edit flow, but requires ongoing attention
- **Competing with established apps** — Meetup, Facebook Groups, SportEasy are used informally now; differentiation must be clear

---

## MVP Scope (v1)

- Account creation & auth (email/password + Google OAuth sign-in)
- Venue discovery (map, listing, venue accounts, suggest-an-edit)
- Session creation and RSVPs (free drop-in + organizer-hosted — no in-app payments)
- User profiles (rating, reliability score, privacy controls)
- Skill rating system (placement, peer ratings, locks, verification gate)
- Session-scoped group chat (Stream Chat)

## Open Questions

- [ ] What cities/regions are the target launch markets?
- [ ] How is venue data seeded at launch — manual entry, community sourcing, or outreach to clubs?
- [ ] Expand to other racket sports eventually (pickleball, squash, tennis)?
