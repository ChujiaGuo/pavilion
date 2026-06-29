# Sports Get-Together App — Brainstorm Notes

_Last updated: 2026-06-28_

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
- Typical skill level of attendees
- Contact info + direct booking link (players book with the venue themselves — we don't handle the transaction)
- User reviews and photos

**Booking model — important:** The app is a *coordination layer*, not a booking layer. A player plans a session a week out, others commit to attending, and everyone books directly with the venue on their own. We never touch the booking transaction. This keeps us out of payment processing, liability, and venue integration complexity.

**Two types of sessions:**
- *Free drop-in* (rec center open play, etc.): no money changes hands through the app. Primary purpose is coordination — players can see who's planning to attend, group themselves by skill, and show up knowing who's there. Booking with the venue is still handled independently.
- *Paid/private rental* (organizer rented the space): attendees pay upfront or leave a deposit through the app. Cancellations must be made at least 12 hours in advance for a refund; no-shows forfeit payment. Organizer is protected since they're on the hook for the court fee.

**Shuttle cost:**
- Standard rule of thumb: ~1 tube (12 birds) per 12 players per hour
- *Paid sessions*: shuttle cost is baked into the session price upfront. App can calculate suggested per-person shuttle contribution based on headcount and session length.
- *Free drop-ins*: up to the organizer. Options:
  - Collect shuttles from participants at the start (each person brings X birds)
  - Same split-cost model as paid sessions, collected informally
  - Organizer specifies shuttle policy when posting the session

**Session options:**
- Format: casual rotation, king of the court, round robin (organizer picks)
- Visibility: public (anyone can find and join) vs. invite-only
- Court count drives max capacity: e.g. 3 courts = 12 players (or up to 16 with rotation)
- Recurring sessions: weekly/biweekly repeat so organizers don't re-post manually

**Cancellation policy refinement:**
- 12-hour window is measured from session start time (clean, easy to communicate)
- If a cancelled spot is filled from the waitlist, the cancelling player gets their fee refunded — much friendlier UX and reduces signup friction overall

**Shuttle cost as a smart feature:**
- App knows player count and session duration, so it can auto-calculate and suggest the shuttle fee per person when the organizer sets pricing (1 tube / 12 players / hour)
- Small but genuinely badminton-specific touch that builds credibility with the community

**Free drop-in as the habit-forming entry point:**
- Highest-volume use case; builds the daily/weekly habit that makes ratings and marketplace valuable
- "I'm going to Thursday drop-in" one-tap RSVP should be the lowest-friction flow in the app
- Get this right and everything else follows

**Advertising for clubs/venues:**
- Clubs and community centers can pay for featured/promoted placement in venue listings
- Sponsored "session suggestions" (e.g., "Club X is hosting open play this Saturday — join")
- Banner or card ads within the venue detail page
- Low friction for venues — just pay for visibility, no integration required

**Open questions:**
- Who maintains venue data? User-submitted + admin-verified? Partner with venues directly?
- How do we handle unofficial venues (someone's church gym, school gymnasium)? → The session organizer posts it directly. If they rented the space, they own the session — others join and coordinate with them, not the venue.
- Do we deep-link to a venue's own booking page, or just show their phone/website?

---

### 2. Skill Rating System

**Scale: 1–8 (+ 8+ category)**

| Level | Description |
|-------|-------------|
| 1 | Complete beginner — never played or just learning rules |
| 2 | Beginner — can rally, knows basic rules |
| 3 | Recreational — consistent rallies, basic serves, learning footwork |
| 4 | Intermediate-low — developing footwork, can smash, plays in casual leagues |
| 5 | Intermediate-high — competitive club level, tactical awareness |
| 6 | Advanced — strong league player, consistent in all strokes |
| 7 | Elite amateur — national juniors, college varsity, state/regional champions |
| 8 | National/international competitive — BWF circuit, national team level |
| 8+ | Top 100 BWF ranked professionals |

**Onboarding / initial rating:**
- Self-reported via a short quiz: highest level played, strongest opponents faced, competitive history, frequency of play, self-assessed weaknesses
- Produces a provisional placement rating that carries low weight
- First 3 sessions are *placement matches*: rating shifts faster (higher learning rate / larger delta multiplier) to get the player to their true level quickly, then stabilizes
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
- **Pro ceiling gate:** organic peer ratings alone cannot push a player into grades 8+. Reaching the pro tier requires external verification — e.g., BWF player ID, documented tournament results, national ranking, or club/coach endorsement. This prevents friend-group inflation from manufacturing fake pros.
- **Unverified ceiling:** players without verification cap out at the top of grade 7 (elite amateur). They can be excellent, but "pro" is a verified status.
- Verification is a one-time process per tier; once granted, the floor locks in permanently (even if the player is inactive for years)
- **Verification prompt UX:** a player who organically reaches the 7.75–7.99 range should be prompted in-app to submit verification credentials — otherwise they hit an invisible ceiling with no path forward. The prompt should explain what verification requires and what unlocks.

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

**Open questions:**
- Regional calibration — a "4.5" in a major metro badminton hub may differ from a "4.5" in a smaller market; worth flagging or adjusting for eventually
- Separate singles vs. doubles rating? (a great singles player isn't always a great doubles player) — probably a v2 feature

---

## Marketplace (Deferred)

Keep in mind for future integration — do not build in v1. Architecture should be modular enough to add without major rework. See `technical-notes.md` for relevant architectural flags.

Core concept: local pro shops list inventory (rackets, shuttlecocks, strings, shoes, apparel), real-time stock, local pickup, commission model, string job bookings.

---

## Platform

- **v1:** Responsive web app with a well-designed mobile form factor — not a native app, but should feel natural on mobile
- **Future:** Dedicated iOS/Android app once the product is validated

---

### 3. Marketplace

**Problem it solves:** Pro shop inventory in the US is inconsistent and hard to find. Players often don't know what's locally available.

**Features:**
- Local pro shops list their inventory (rackets, shuttlecocks, shoes, strings, grips, bags, apparel)
- Real-time or near-real-time stock status
- Local pickup or local shipping option
- Commission model: app takes % of each transaction
- String job bookings (extremely common need — most serious players restring frequently)
- Racket demo/rental programs (shops can offer try-before-you-buy)

**Monetization:** Commission per sale (e.g., 8–12%), premium shop listings for featured placement.

**Open questions:**
- Do we handle payments in-app or redirect to shop's own checkout?
- Shipping logistics — do we become a fulfillment layer or just a discovery layer?
- How do we compete with Amazon for commodity items (grips, shuttles)? Angle: local availability + expertise + community trust.

---

## Additional Features (Future)

### Session Organization
- Create a session: pick venue, date/time, format (casual, competitive, training), skill range requirement
- Invite specific players or open it publicly
- Fill spots via waitlist
- Session chat
- Post-session rating prompts

### Community / Social
- Player profiles: stats, ratings history, venues frequented, gear used
- Follow players, see upcoming sessions they're attending
- Kudos/endorsements for sportsmanship

### Leagues & Tournaments
- Organize ladder leagues within a venue or city
- Round-robin tournament bracket tool
- Club admins can manage rosters and schedules

### Coach Discovery
- Verified coaches list their rates, availability, specialties
- Book lessons through the app

---

## Monetization Levers

| Revenue Stream | Notes |
|---|---|
| Marketplace commission | Primary long-term revenue |
| Club/venue advertising | Featured placement, sponsored session posts — no booking integration needed |
| Premium player subscriptions | Advanced analytics, priority session access |
| Club/organization subscriptions | Admin tools, league management, branding |
| Featured placement in venue/shop listings | Low-friction ad product |

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
- **Venue data staleness** — hours change, courts close; needs a maintenance loop
- **Competing with established apps** — Meetup, Facebook Groups, SportEasy are used informally now; differentiation must be clear

---

## Open Questions / Next Steps

- [ ] What cities/regions are the target launch markets?
- [ ] Mobile-first (iOS/Android) or web first?
- [ ] Do we build venue data from scratch or scrape/partner for initial data?
- [ ] What does MVP look like? (Probably: venue list + session creation + basic profiles, no marketplace yet)
- [ ] How does the skill level quiz work for onboarding?
- [ ] Potential to expand to other racket sports later (pickleball, squash, tennis)?
