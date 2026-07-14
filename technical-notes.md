# Technical Notes

_Last updated: 2026-07-13 (added moderator+ session-roster admin view (`GET /:id/rsvps?admin=true`) and player removal (`DELETE /:id/rsvps/:userId`, upcoming-only) to the session domain — see "Admin & Roles")_

See `brainstorm.md` for product/idea context, `misc-tech-notes.md` for one-time decisions/historical notes/implementation footnotes, `database-schema.md` for full table definitions.

---

## Table of Contents

- [Platform & Stack](#platform--stack) — L21
- [Architecture & Domain Boundaries](#architecture--domain-boundaries) — L42
- [Admin & Roles](#admin--roles) — L66
- [API Endpoints](#api-endpoints) — L79
- [Core Algorithms](#core-algorithms) — L146
- [Environments & Testing](#environments--testing) — L180
- [Known Issues](#known-issues) — L192

---

## Platform & Stack

- **v1:** Responsive web app — mobile-first layout, no native app yet
- **Future:** Native iOS/Android once product is validated
- Design breakpoints prioritize phone viewport; tablet/desktop are secondary

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (full stack) | Shared types between frontend and backend |
| Monorepo | npm workspaces | `/client` + `/server` + shared `/packages/types` in one repo |
| Frontend | Next.js | React-based, SSR/SSG, mobile-responsive support |
| Backend | Node.js + Hono | TypeScript-first, fast, minimal bundle — chosen over Express |
| Database + Auth | Supabase (PostgreSQL) | Relational model fits sessions/ratings/venues; native PostGIS geospatial search (`nearby_venues` RPC); open-source/no vendor lock-in; predictable compute/storage-based pricing. RLS is **not** enabled — `service_role` bypasses it unconditionally, so all authorization (including admin checks) is enforced in service-layer code, not DB policy; the risk this carries is the service-role key itself leaking (env-var only, gitignored, never sent to client). Chosen over Firebase, which would've won only on offline-first mobile support (not relevant for web-first v1) |
| Messaging | Stream Chat | Pre-built React components, handles realtime/push/storage (stub, not yet implemented) |
| Payments | Stripe | Deferred to v2 — see brainstorm.md Future Features Roadmap |
| Hosting | Render (server) + Vercel (client) | Split so Next.js gets Vercel's native pipeline while Hono API stays on Render |

Full Supabase-vs-Firebase comparison detail: misc-tech-notes.md's Stack & Platform Decisions section.

---

## Architecture & Domain Boundaries

**Pattern: Modular Monolith for v1** — deploys as one unit but enforces strict domain boundaries internally (no cross-domain imports); marketplace extracts cleanly as a true service once it's built.

| Domain | Responsibility |
|---|---|
| `user` | Auth, profiles, privacy settings, verification |
| `venue` | Listings, geospatial search, discovery |
| `session` | Creation, RSVPs, scheduling. No payments or shuttle-cost auto-calc in v1 |
| `rating` | Score calculation, history, locks, anomaly detection |
| `admin` | Role lookup/grant/revoke, unified role-scoped audit feed across domains — see "Admin & Roles" below |
| `messaging` | Thin wrapper over Stream Chat (session-scoped group chat) — stub only |
| `marketplace` | Stub only, fully deferred — don't implement or reference from other domains |

Canonical copy of this table — `README.md`/`CLAUDE.md` reference it, don't duplicate.

**No booking transactions in v1** — the app is a coordination layer; organizers collect payment externally.

**Auth** — Supabase Auth called directly from the client (`@supabase/ssr`), no `/api/auth` endpoint; `middleware/auth.ts` validates the bearer token generically on every domain API call. Email confirmation required before login; Google OAuth via PKCE `/auth/callback`; client-side `useRequireAuth` hook guards every authenticated page. A 401 from any domain API call (session expired/revoked after `useRequireAuth` already let the page render) is handled once, centrally, in `lib/api.ts`'s `apiRequest` — it signs out locally and hard-redirects to `/login?next=...`. Pages should keep swallowing request failures into their own "couldn't load" state and must not add their own 401-specific handling. Full flow detail (including local-dev config gotchas) is in misc-tech-notes.md's Auth and Client Application Shell sections.

**Security headers** — CORS is an explicit `ALLOWED_ORIGINS` allow-list (`src/server/src/index.ts`); CSP is client-only and Report-Only for now (`next.config.ts`). Detail in misc-tech-notes.md's Security Headers & CORS section.

---

## Admin & Roles

**Role hierarchy:** `admins.role` holds one of four values, ranked low→high: `venue_verifier` < `moderator` < `admin` < `owner`. A higher role can do everything a lower one can — single rank comparison, not a per-action permission matrix. No CHECK constraint — enforced app-side only.

**Per-domain override pattern.** Every admin-gated write does its own role check inside the service function it belongs to (not shared middleware):
```ts
let query = supabase.from('sessions').update(updates).eq('id', id);
if (!isModerator) query = query.eq('organizer_id', userId);
```
Every domain follows this same pattern for its own admin-gated actions (search/edit users, search/edit sessions, adjust ratings, create/edit venues), writing a best-effort audit row (`admin_user_edits`/`admin_session_edits`/`admin_venue_edits`/`rating_history.performed_by`) on the admin-override branch. `GET /api/admin/history` merges all of these plus `admin_role_changes` into one role-scoped feed. Per-domain implementation detail, the History tab's diff mechanics, and the verification-toggle flow are in misc-tech-notes.md's Admin & Roles section.

**Removing another player's RSVP (`removeRsvp`, `DELETE /api/sessions/:id/rsvps/:userId`) is moderator+ only with no self-service equivalent** — unlike the widen-the-`WHERE`-clause shape above, this action has no organizer branch at all (organizers can't remove attendees themselves in v1), and it's further restricted to `upcoming` sessions only (no rewriting `active`/`completed` attendance history) and skips the late-cancel reliability penalty entirely, since that penalty represents the player's own choice to bail, not a moderator's. Always writes an `admin_session_edits` row (`action: 'remove_rsvp'`) since there's no non-admin branch to compare against.

---

## API Endpoints

All routes mounted under `/api/<domain>`. **Auth** `yes` = Bearer token required; `no` = public.

### `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| `DELETE` | `/:id` | yes | Soft-delete own account (`deleted_at`), self-only |
| `GET` | `/` | yes (moderator+) | Search users, bypasses private-profile filter, capped 50 rows |
| `GET` | `/:id` | yes | Get profile, 404 if private and caller isn't the owner |
| `PATCH` | `/:id` | yes | Update whitelisted profile fields; self-only unless moderator+; `firstName`/`lastName` locked once `verified_tier` is set |
| `PATCH` | `/:id/verify` | yes (admin+) | Sets/clears `verified_tier` (8) + `rating_floor` (6.0); requires name on file |

### `/api/venues`
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | no | List venues; `lat`/`lng`/`radius_miles` (all three required together) switches to the `nearby_venues` PostGIS RPC, nearest-first with `distanceMiles` |
| `GET` | `/:id` | no | Get venue with hours |
| `GET` | `/places/autocomplete` | yes (venue_verifier+) | Google Places (New) autocomplete proxy; `configured: false` degradation when no API key is set |
| `GET` | `/places/details` | yes (venue_verifier+) | Google Places (New) place-details proxy; same `configured: false` degradation |
| `PATCH` | `/:id` | yes (admin, or claimed owner) | Update fields; optional `hours` fully replaces (delete + insert) |
| `POST` | `/` | yes (admin) | Create venue; optional `hours` array writes `venue_hours` rows |
| `POST` | `/:id/claim` | yes | Atomic check-and-set claim of an unclaimed venue |
| `POST` | `/:id/suggest-edit` | yes | Submit a field-edit suggestion |

### `/api/sessions`
| Method | Path | Auth | Description |
|---|---|---|---|
| `DELETE` | `/:id` | yes (organizer/moderator+) | Cancel (`upcoming` sessions only) |
| `DELETE` | `/:id/rsvp` | yes | Cancel own RSVP; promotes oldest waitlisted RSVP; 5-point reliability penalty within 12h of start |
| `DELETE` | `/:id/rsvps/:userId` | yes (moderator+) | Remove another player's RSVP; `upcoming` sessions only, no reliability penalty; promotes oldest waitlisted RSVP same as self-cancel |
| `GET` | `/` | no (moderator+ for `admin=true`) | List/search sessions; `public`-only unless the caller owns the session or passes an exact `id`; `admin=true` bypasses all visibility rules, capped 50 rows |
| `GET` | `/:id` | conditional | Get session + `organizerName`; `invite_only` requires a valid Bearer token |
| `GET` | `/:id/rsvp` | yes | Caller's own RSVP status |
| `GET` | `/:id/rsvps` | conditional (moderator+ for `admin=true`) | List active RSVPs with `displayName`; names visible to shared participants regardless of privacy, else `public`-only; `admin=true` returns every RSVP status (including `cancelled`/`attended`/`no_show`) and every name regardless of privacy |
| `PATCH` | `/:id` | yes (organizer/moderator+) | Update fields; re-validates the skill-range invariant even on a single-bound patch |
| `PATCH` | `/:id/status` | yes (organizer/moderator+) | Advance `upcoming → active → completed`; 409 on invalid transitions |
| `POST` | `/` | yes | Create session; skill range validated against the `numeric(4,2)` column ceiling; returns `warning: "skill_range_wide"` if organizer grade is far from the range |
| `POST` | `/:id/attendance` | yes (organizer/moderator+) | Mark attendance; no-shows lose 10 reliability points |
| `POST` | `/:id/rsvp` | yes | Join; enforces skill range (asymmetric — see Core Algorithms) and capacity |

### `/api/ratings`
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/user/:userId` | yes | Get rating display (grade/subtier/label); `?raw=true` (admin+) additionally returns `rawScore` |
| `GET` | `/user/:userId/history` | yes | Own score-delta history, self-only |
| `POST` | `/onboarding/skip` | yes | Skip placement quiz, applies default score, writes initial score |
| `POST` | `/onboarding/submit` | yes | Submit placement quiz answers, writes initial score |
| `POST` | `/submit` | yes | Submit a peer rating vote (`much_stronger`…`much_weaker`, `did_not_play`) |
| `POST` | `/user/:userId/adjust` | yes (admin+) | Manual score override, clamped like the live algorithm, optimistic compare-and-swap |

### `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| `DELETE` | `/roles/:userId` | yes (owner) | Revoke a role grant |
| `GET` | `/history` | yes (any admin role) | Unified role-scoped audit feed |
| `GET` | `/me` | yes | Caller's `AdminRole` |
| `GET` | `/roles` | yes (owner) | List role grants |
| `PATCH` | `/roles/:userId` | yes (owner) | Grant/change a role |

### `/api/messaging` _(stub — not yet implemented)_
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/session/:sessionId/channel` | — | Provision a Stream Chat channel (`session_{sessionId}` convention) |
| `POST` | `/token` | — | Generate a Stream Chat user token |

---

## Core Algorithms

### Rating System
Implemented in `rating.algorithm.ts` (pure, no Supabase import) + `rating.service.ts` (DB orchestration).

- **Display:** `grade = floor(score)`; `subtier = floor((score % 1) / 0.25) + 1` (1–4); label `"Grade {grade} — {I|II|III|IV}"`. Raw float never exposed to the client except admin+ via `?raw=true`.
- **Per-vote scoring** (applied immediately, not batched): vote → offset (`much_stronger=+1.0` … `much_weaker=-1.0`) → `impliedTarget = sessionAnchor(avg of 'going' RSVPs) + offset` → `weight = proWeight × calibrationWeight × familiarityWeight` (pro 1.5× only on downward/neutral votes; calibration decays past 2.0-grade gaps to a 0.25 floor; familiarity uses a 60-day recency half-life) → `delta = learningRate(0.12, or 0.35 during placement) × weight × (impliedTarget − rateeScore)`, clamped ±1.0 (placement) / ±0.5 (standard).
- **Clamps:** floor at `rating_floor` if set; ceiling `7.99` if `verified_tier` is null; absolute floor `1.0`; round to 2dp.
- **Tier-boundary protection:** a vote that would cross a whole-grade boundary pins the raw score at the boundary instead of drifting past it; releases to exactly one subtier past the line after 7 days (demotion) / 3 days (promotion) of sustained trend — asymmetric by design (climbing requires less proof than falling gets forgiveness for). Recovery cancels protection immediately; skipped entirely during placement.
- **Onboarding:** initial score from a 4-question placement quiz (averaged, clamped `[1, 7.99]`) or a `2.75` skip default; written via a claim-style atomic `UPDATE ... WHERE onboarding_completed_at IS NULL`.
- **Anomaly flag (not a block):** `|raterScore - rateeScore| > 2.0` grades.

Scope, race-handling, and onboarding implementation detail: misc-tech-notes.md's Rating System section.

### Skill Range Enforcement (asymmetric)
`session.service.ts`'s `joinSession`, range stored as `[skill_min, skill_max]` (`numeric(4,2)`):
- Playing up `skill_min − player_score > 1.5`: hard block (`skill_blocked`); `0–1.5`: allowed with `warning: 'playing_up'`
- Playing down `player_score − skill_max > 3.0`: hard block; `0–3.0`: allowed with `warning: 'playing_down'`
- Organizer joining their own session: skill check skipped entirely
- Not yet implemented: `strict_range` toggle (column exists, unenforced), organizer notification on a high-rated joiner, rating dampening for out-of-range players

### RSVP & Attendance Concurrency
Atomic Postgres functions (`SECURITY DEFINER`, `REVOKE`d from `PUBLIC`/`anon`/`authenticated`, granted to `service_role` only), called via `supabase.rpc(...)` from `session.service.ts`:
- `join_session_atomic` — row-locks the session (`FOR UPDATE`), counts `going` RSVPs, inserts/upserts in one transaction
- `cancel_rsvp_and_promote` — same lock, cancels + promotes the oldest waitlisted RSVP (`joined_at` ascending) in one transaction; skips promotion on a dead (`cancelled`/`completed`) session
- `decrement_reliability_score` — atomic `GREATEST(0, score − points)`

Every new `SECURITY DEFINER` RPC needs its own explicit `REVOKE`/`GRANT service_role` pair — Postgres defaults `EXECUTE` to `PUBLIC`, and this doesn't inherit from `ALTER DEFAULT PRIVILEGES` (tables/sequences only). Implementation detail (lock ordering, `markAttendance`'s JS-level idempotency, best-effort penalty semantics): misc-tech-notes.md's Session & Venue section.

### Payment Model (v1)
No in-app payments — coordination only, organizers collect payment externally. Reliability score: −5 for cancelling within 12h of `starts_at`, −10 for an organizer-marked no-show, clamped to 0. Stripe/shuttle-cost auto-calc deferred to v2 — see brainstorm.md.

---

## Environments & Testing

- **Local dev:** `supabase start` (Docker Postgres + Auth + Studio); **prod:** Render (server) + Vercel (client) + Supabase cloud — both auto-deploy on push to `main`
- **RPC grants:** every `SECURITY DEFINER` RPC needs an explicit `REVOKE`/`GRANT service_role` pair (see Core Algorithms above) — Postgres defaults new-function `EXECUTE` to `PUBLIC`
- **Unit suite** (`npm test --workspace=server`): mocked Supabase client, no Docker
- **Integration suite** (`npm run test:integration --workspace=server`): real local Postgres, requires `supabase start`; isolates via `TRUNCATE ... CASCADE` per test, not transaction rollback (PostgREST runs each request as its own transaction)
- **Frontend e2e** (`npm run test:e2e --workspace=client`): Playwright, `chromium` + `mobile-chromium` projects

Fixture/isolation detail: misc-tech-notes.md's Testing section.

---

## Known Issues

Confirmed defects deferred from v1. Fix before traffic warrants it; do not rediscover these as new bugs.

| ID | Location | Symptom | Fix when |
|---|---|---|---|
| KI-001 | `session.service.ts`, `20260701000001_atomic_rsvp_operations.sql` | A join racing a concurrent cancel can insert an RSVP on a `cancelled`/`completed` session — `join_session_atomic` locks for capacity but never re-reads `status`; the `upcoming`-only guard lives in JS, outside the lock | Sessions fill fast enough that concurrent join demand is routine |
| KI-003 | `session.router.ts` `PATCH /:id/status`, `progressSessionStatus()` | Race-loser of a concurrent status advance gets `404` instead of `409` — cosmetic, no data corruption | If clients start branching on 404 vs 409, or before adding retry logic |
| KI-004 | `20260629000000_initial_schema.sql` | Deleting a user via the admin API fails once their profile has rows in tables that reference `profiles(id)` without `ON DELETE CASCADE` (sessions, RSVPs, ratings, admin grants, etc.) | Before account deletion becomes a real user-facing feature |
| KI-005 | `src/client/src/app/auth/callback/route.ts` | Open redirect: `next` is interpolated into the redirect with no allow-list on this route itself — not confirmed exploitable today since `next` is only ever set by our own code and Supabase's own redirect allow-list may already block an off-site target | If `next` is ever driven by anything beyond the two flows that set it today |
| KI-006 | `admin.service.ts` (`listAdmins`), `user.service.ts` (`searchUsers`) | A DB query failure *after* the role check passes is swallowed into an empty-result success response, indistinguishable from a genuinely empty result | Before treating either endpoint's empty result as ground truth for anything operationally important |
| KI-007 | `admin-venues-panel.tsx` (create form) | A venue can be created with `lat`/`lng` of exactly `(0, 0)` if no Places suggestion was ever clicked (`Number('')` coerces to `0`, passes the `NOT NULL` constraint) | Cheap to close — reject `lat === 0 && lng === 0` server-side, or require a resolved `placeId` before enabling Create |
