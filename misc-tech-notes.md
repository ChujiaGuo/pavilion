# Misc Tech Notes

_One-time engineering decisions, historical context, local-dev environment quirks, local configuration warnings, and granular implementation footnotes — see CLAUDE.md's Document goals for the split from technical-notes.md. Nothing filed here should need to be an active daily-development reference; if a note here turns out to get looked up regularly, promote it back to technical-notes.md instead of duplicating it._

See [technical-notes.md](technical-notes.md) for the condensed architecture/API-contract/algorithm reference this file offloads from.

---

## Table of Contents

- [Stack & Platform Decisions](#stack--platform-decisions)
- [Auth](#auth)
- [Client Application Shell](#client-application-shell)
- [Security Headers & CORS](#security-headers--cors)
- [Rating System](#rating-system)
- [Environments](#environments)
- [Testing](#testing)
- [Database Logic](#database-logic)
- [Admin & Roles](#admin--roles)
- [Session & Venue](#session--venue)
- [Messaging](#messaging)

---

## Stack & Platform Decisions

**Full Supabase-vs-Firebase comparison** (relational data model, rating-calculation fit, geospatial search, RLS posture, marketplace readiness, open-source/pricing) lives in technical-notes.md's Stack table rationale — condensed there rather than duplicated here, since it's active stack-choice rationale, not one-off history.

---

## Auth

**Email/password.** Signup/login are client-only pages (`src/client/src/app/signup/`, `.../login/`) that call Supabase Auth directly via `@supabase/ssr`'s `createBrowserClient` — there's no `/api/auth` endpoint on the Hono server. `signUp` passes `display_name`, `city`, and (when filled in) `first_name`/`last_name` in `options.data`, which the `handle_new_user` trigger reads straight off `raw_user_meta_data` when it auto-creates the `profiles` row — `city` `COALESCE`d to `''` since Google OAuth signups never populate it, `first_name`/`last_name` left `NULL` when omitted. Login is a direct `signInWithPassword` call; `middleware/auth.ts` validates the resulting bearer token generically on subsequent domain API calls.

**Why profile fields are set via the signup trigger, not a follow-up `PATCH`.** An earlier version of the signup flow called `PATCH /api/users/:id` right after `signUp()` (using the bearer token from the just-created session) to set `displayName`/`city`/`firstName`/`lastName`. That broke once email confirmation became required — `signUp()` returns no session until the confirmation link is clicked, so there was no token to `PATCH` with, and the fields would've silently gone unset. Fixed by folding those fields into the `handle_new_user` trigger instead, which reads `raw_user_meta_data` straight off the `auth.users` insert and fires unconditionally regardless of confirmation status.

**Email confirmation.** Mirrors prod's Supabase dashboard setting — `supabase/config.toml`'s `[auth.email] enable_confirmations` is `true`, so `signUp()` returns `{ session: null, user }` and the user lands on `/verify-email` instead of going straight to `/onboarding/quiz`. That page offers a "Resend confirmation email" button (`supabase.auth.resend({ type: 'signup', email })`); `login/page.tsx` also redirects here when `signInWithPassword` fails with `error.code === 'email_not_confirmed'`. The confirmation email itself is GoTrue's plain default template — a branded one (`supabase/templates/confirm_signup.html`, `/auth/confirm/route.ts`) is built but not active, since `supabase config push` rejected email-template customization on the free tier without custom SMTP configured. `emailRedirectTo` (freely settable regardless of which template is active) points confirmation links at `/email-confirmed`, which establishes the session client-side.

**Deep dive: why `/email-confirmed` has to be a client component, and why `/auth/confirm` exists but isn't reachable.** GoTrue's default confirmation template links to its own hosted `/auth/v1/verify` endpoint, which confirms the account server-side *before* redirecting to `emailRedirectTo` with an implicit-flow token fragment (`#access_token=...`) — confirmed by testing directly against local GoTrue that this redirect carries no `Set-Cookie`, so nothing server-side establishes the app session. `/email-confirmed/page.tsx` is a client component specifically because of this: `@supabase/ssr`'s `createBrowserClient` defaults `detectSessionInUrl` to `true`, so constructing it on mount parses that fragment and establishes the session itself. A branded `/auth/confirm/route.ts` (`verifyOtp({ type, token_hash })`) was built and is fully implemented/tested (`verify-email.spec.ts`'s direct-route test) — deliberately separate from `/auth/callback`'s PKCE `code` exchange, since the confirm-signup link is opened from a mail client that may not have the PKCE `code_verifier` `signUp()` stashed, unlike a `token_hash` which needs no client-side state — but it's unreachable through the real signup flow while the branded template stays inactive.

**Google OAuth.** `GoogleSignInButton` calls `signInWithOAuth({ provider: 'google', options: { redirectTo: '.../auth/callback' } })` on the browser client, appending `?next=<path>` when the login page passed one. `src/client/src/app/auth/callback/route.ts` is the PKCE callback: it exchanges the `code` param for a session via a cookie-aware server client, then redirects to `/onboarding/quiz` if `app_metadata.onboarding_completed` isn't set, or to `next` (defaulting to `/home`) if it is. The onboarding check applies to every `next` value except the password-recovery flow's `next=/reset-password`. On failure it redirects to `/login?error=oauth_failed`, or `/forgot-password?error=reset_link_invalid` for a `next=/reset-password` link.

**`config.toml`'s `enabled` flag for Google is a shared, git-tracked setting — not a personal toggle.** `supabase/config.toml`'s `[auth.external.google]` block reads `client_id`/`secret` from env vars, but `enabled` gates the whole provider — and `config.toml` itself is committed to git. Flipping `enabled = true` and committing it turns Google sign-in on for *every* teammate and CI run, not just the machine that happens to have those two env vars sitting in its own untracked, gitignored root `.env`. **Never commit `enabled = true` without first getting the real credentials into a place every other `supabase start` can reach** — otherwise anyone else who pulls the branch gets a `supabase start` that can't resolve the referenced env vars, for a provider they never asked to enable. See README.md "Enabling Google sign-in (optional)" for the full walkthrough and this same warning.

**Password reset.** `forgot-password/page.tsx` calls `resetPasswordForEmail(email, { redirectTo: '.../auth/callback?next=/reset-password' })` and always shows the same "if an account exists, we've sent a link" result regardless of whether the email is registered — deliberately no separate existence check, since that would require a new service-role-backed endpoint and would turn the form into a user-enumeration oracle. The emailed link reuses the same PKCE `/auth/callback` route as Google OAuth. `reset-password/page.tsx` checks for a session on mount and, if present, submits the new password via `updateUser({ password })`, then redirects to `/home`.

**`/reset-password` only checks "is there a session," not "did it come from the recovery link" — closed via `secure_password_change`, not app code.** The server-side PKCE exchange means the client-side `PASSWORD_RECOVERY` auth event never fires in this flow, so there's no client-visible signal to distinguish "just came from the emailed link" from "was already logged in and browsed here directly." Rather than fake that distinction client-side (trivially spoofable), `[auth.email] secure_password_change` in `supabase/config.toml` is set to `true`: confirmed by testing directly against local GoTrue that this checks the session's original auth timestamp (the JWT's `amr` claim) and rejects `updateUser({ password })` for sessions that aren't recent.

**Rate limiting on login/signup/reset — Supabase Auth's own `[auth.rate_limit]`, tuned; app-level limiting deliberately not built.** Login/signup/password-reset all bypass the Hono server entirely, so a Hono rate-limit middleware would have nothing to intercept. `supabase/config.toml`'s `[auth.rate_limit]` was tuned down from the CLI's stock defaults: `sign_in_sign_ups` (login+signup) `30→10`/5min, `token_verifications` `30→15`/5min; `email_sent` tuned *up* `2→3`/hour, since 2 was tight enough to block a legitimate re-request. Still per-IP only. CAPTCHA would close that gap but needs a provider account/keys — deferred. Proxying these calls through the Hono server was considered and explicitly declined for now.

**`config push`'s per-project overrides — `[remotes.production]` in `config.toml`.** `supabase config push` syncs the *entire* `config.toml` `[auth]` section (not just rate limits) to the linked project, which is a documented CLI gotcha (supabase/cli#3208, #3365): without an override, it would silently overwrite prod's Site URL/Redirect URLs with this file's local-dev values on every push. `config.toml` has a commented `[remotes.production]` template for exactly this reason — see README.md "Production setup."

**Redirect URL allow-list needs a wildcard per non-`site_url` host.** `additional_redirect_urls` takes exact URLs — `site_url` permits any subpath, but an `additional_redirect_urls` entry only matches paths under it with a trailing `/**` wildcard. `http://127.0.0.1:3000/**`, `http://localhost:3000/**`, and `https://localhost:3000/**` are all listed for this reason. Applying a `config.toml` auth change requires `supabase stop && supabase start`.

**`site_url` must be `localhost`, not `127.0.0.1` — `next dev`'s Route Handlers don't derive their own origin from the incoming request.** `/auth/confirm/route.ts` and `/auth/callback/route.ts` compute their redirect target from `new URL(request.url).origin`, which always resolves to `http://localhost:3000` in `next dev` regardless of which host/IP the request arrived on. The confirm-signup email link is built server-side from `{{ .SiteURL }}`, independent of the browsing host. With `site_url` at `127.0.0.1:3000`, the confirm link pointed the browser at `127.0.0.1`, the cookie was set on that origin, and the redirect immediately sent the browser to `localhost` — a different origin, so the cookie didn't follow and the freshly-confirmed user bounced to `/login`. Local-dev-only quirk — a production build constructs `origin` from the real request.

---

## Client Application Shell

**`/home`.** The authenticated landing page. `/` stays the public marketing landing page (unauthenticated, server-rendered) — deliberately separate routes rather than one route branching on auth state.

**Auth guard — `useRequireAuth` (`src/client/src/lib/hooks/use-require-auth.ts`).** Client-side hook shared by `/home` and every other page behind `AppShell`: on mount, checks `supabase.auth.getSession()` and redirects to `/login?next=...` if there's no session, or `/onboarding/quiz` if onboarding isn't complete. Callers render `null` until the hook resolves. Still a client-side redirect, not edge middleware — `src/client/src/middleware.ts` only refreshes an expiring session cookie, it doesn't gate routes.

**Post-login redirect to the originally-requested page.** `useRequireAuth`'s `next` query param is read back by `login/page.tsx` and used in place of the default `/home` redirect once sign-in succeeds and onboarding is already complete. `next` is untrusted input, so it's validated by `lib/safe-next-path.ts`'s `isSafeNextPath` (must start with a single `/`, not `//` or `/\`, no `://`) before use. Deliberately not threaded through the onboarding quiz — only an already-onboarded user's `next` survives all the way back.

**Nav shell — `AppNav` + `AppShell`.** `AppNav` renders four destinations — Home, Sessions, Nearby venues, Profile — as a fixed bottom tab bar below `sm` and a fixed left sidebar at `sm`+. `AppShell` wraps it with the shared header and content padding. Player search was originally the fourth nav slot; replaced with Home once the nav grew to include Profile, and `/players` was pushed out to stay unlinked rather than the nav growing to five items.

**`/venues` — implemented: listing, filters, and a read-only detail page. `/players` — stub page, no longer linked from `AppNav`.** `/venues` mirrors `/sessions`' Browse tab structurally: `VenueFilters` puts Search (name) always-visible in the primary row, plus a Distance radius `<select>` (5/10/25 default/50/100 mi) that only renders once `useGeolocation` resolves to `granted` — hidden entirely on `denied`/`unsupported`. Type and Drop-in-available sit behind the same responsive Drawer/Popover "More filters" disclosure `SessionFilters` established. `VenueCard` mirrors `SessionCard`'s exact editorial list-item style and links to `/venues/[id]`, which fetches the full `Venue` (incl. `hours`) plus `GET /api/sessions?venue_id=<id>&status=upcoming` — no new session endpoint needed.

**`/sessions`, `/sessions/new`, `/sessions/[id]` — implemented: browse/search, RSVP lifecycle, and organizer management.** No new server endpoints. `/sessions` has three tabs — **Browse** (public sessions), **Hosting** (`organizer_id=<self>`), **Attending** (`attendee_id=<self>`) — plus a status selector and, on Browse only, `SessionFilters`. Deliberately no per-card spot count (`GET /api/sessions` doesn't return RSVP counts, and fetching one per card would be an N+1 call) — spot count only appears on the detail page.

**Browse filters are editorial, not boxed** — Search and Date stay inline as always-visible primary controls; Skill min/max sit behind a "More filters" pill. Skill defaults are computed per-user (`computeDefaultSkillRange` — floor = grade − 1.5, ceiling = grade + 3.0, clamped to `[1, 7.99]`, a narrower clamp than the `[1, 99.99]` the server actually allows, since this is a *default view*, not the hard limit). Date is an adaptive range: two `<input type="date">`s plus a computed summary caption. An inverted range shows an inline warning and blocks auto-apply until fixed. `date_to` is sent as end-of-day, not midnight.

**Search filters by venue name or exact session id, not city — single input, client-side auto-detected.** The query-building effect checks the trimmed value against a UUID regex — a match sends it as `id`, anything else as `name`. This is what lets a shared session link's UUID surface an `invite_only` session that a plain-text venue-name search intentionally can't.

**A separate "Venue" field (behind "More filters") filters to one real venue by `venue_id`, distinct from the free-text Search field.** Built on `VenuePicker` (`allowFreeText={false}` mode) — only clicking an actual suggestion sets `BrowseFilters.venueId`.

**Browse filters are reactive, not submit-driven.** `SessionFilters` auto-applies the whole filter set 400ms after the last change, instead of requiring an explicit Search/Apply click. A `lastAppliedRef` skips re-firing when the pending value is identical to what's already applied.

**`/sessions/new` and the inline "Edit session" form share one field-rendering component, `SessionFormFields`.** In `create` mode, venue selection is `VenuePicker` (`allowFreeText` mode) — picking a real venue sets both `venueId` and pins the text, but the field stays freely editable, and typing after a pick clears `venueId` back to `null`. `edit` mode keeps the original plain-text `venueName` input — `SessionUpdateFields` excludes `venueId` server-side.

**`VenuePicker` is built on `@base-ui/react`'s `Autocomplete` namespace, not the `Combobox` namespace.** Gotcha found while building this: `Autocomplete`'s `fillInputOnItemPress` behavior means clicking a suggestion *also* re-fires the root's `onValueChange` in addition to the item's own `onClick` — if both handlers "clear the picked venueId on any text change," the auto-fill's `onValueChange` call immediately clobbers the just-set `venueId` back to `null`. Confirmed via a real Playwright run — a purely mocked test wouldn't have caught this. Fixed by checking `eventDetails.reason` and skipping the clear when it's `'item-press'`.

**Picking a suggestion advances focus (create-mode only) and stops the dropdown reopening on its own pick.** `VenuePicker`'s optional `onSelect` prop moves focus to Skill min once a venue is picked. Separately, `handlePick` sets `query` to the picked venue's own name, which would otherwise re-trigger the debounced search effect and reopen the dropdown — guarded by checking the effect's text against the actual committed value.

**Form layout: categorical fields grouped first, numeric/text fields after** — a deliberate section split ("Session details" / "Logistics"). `emptySessionFormValues()` seeds context-aware, non-blank defaults: `skillMin`/`skillMax` = `3.0`/`5.0`, `courtCount` = `1`, `maxPlayers` = `8`, `durationMinutes` = `60`, `startsAt` defaults to tomorrow evening.

**`starts_at` uses `StartsAtPicker`, not a bare `<input type="datetime-local">`.** Mobile browsers often render `datetime-local` as fiddly nested segments — this splits the value into a native `<input type="date">` plus one-tap time-of-day pills with a native `<input type="time">` fallback.

**`/sessions/[id]` resolves organizer/attendee display names server-side, not via client-side fan-out.** RSVP and organizer actions use inline confirm states rather than a dialog primitive — no `dialog` component is installed. The "cancelling within 12h costs reliability points" warning is computed client-side from `starts_at`.

**Share button copies the page URL, client-only, no backend involvement.** Confirmation is a transient `role="status"` popup shown for 1s via `setTimeout`. The button's own label never changes.

**Copy path falls back to `execCommand('copy')` when the Async Clipboard API is unavailable.** `navigator.clipboard` only exists in a secure context, so it's `undefined` in Safari when the app is reached over a plain-http LAN IP. Found by testing the Share button on an actual iPhone over Safari, where it silently did nothing; Chrome's desktop mobile-device emulator didn't catch this since it's served from `localhost`. `handleShare` falls back to a temporary off-screen `<textarea>` + `document.execCommand('copy')`.

**`/profile` — implemented, view + edit + logout.** View mode composes the caller's own data from `GET /api/users/:id` and `GET /api/ratings/user/:userId` — no new endpoint, no `getUserProfile()`-style aggregation. The rating row renders `Grade {grade}` next to a 4-star indicator rather than the API's roman-numeral `label` string.

**Edit mode covers every editable `PATCH /api/users/:id` field except `photoUrl`** (no upload flow exists yet). `firstName`/`lastName` are sent as `null` rather than `''` when cleared.

**Privacy — shared-session name exception.** `getSessionRsvps` and `getSessionOrganizerName` (both `session.service.ts`) special-case any caller who is themselves an active participant of the same session — the organizer, or a `going`/`waitlisted`/`attended` attendee — so that caller sees every co-attendee's and the organizer's display name regardless of `privacy_level`. Anyone else (including an anonymous browser of a public session) still only sees names for `public` profiles. `getUserById` is deliberately untouched — this carve-out is session-scoped, not a change to general profile visibility.

**Verified users' names are locked — app-layer rule, not just the DB constraint.** `updateUser` rejects with `{ ok: false, reason: 'name_locked' }` for any `PATCH` that includes `firstName`/`lastName` at all once `profiles.verified_tier` is set, regardless of whether the value actually differs. Stricter than `profiles_verified_requires_name` (which only blocks *clearing* the name) — once verified, the name is checked against real credentials, so allowing a *different* non-null value would decouple the verified badge from the identity it verified. `ProfilePage`'s edit form mirrors this with `disabled` inputs and omits both keys from the request body in that case rather than sending them unchanged. Verified against a real Postgres instance in `user.integration.test.ts`.

**`PATCH /api/users/:id` is mass-assignment-safe by construction, not by validation.** `updateUser` never spreads the request body into the DB update — nine explicit `if (fields.x !== undefined) updates.x_column = fields.x` lines, one per editable column. A body containing `internalScore`/`verifiedTier`/`ratingFloor`/`reliabilityScore` is structurally inert — `updateUser` never reads those properties. Request-body validation is defense against bad *values* for the nine allowed fields, not a privilege-escalation backstop — that backstop already exists structurally.

**Request-body validation — `user.router.ts`'s `PATCH /:id`.** Validates each of the nine editable fields before calling `updateUser`, `400`ing on the first failure: `displayName` non-empty string; `firstName`/`lastName`/`photoUrl` string-or-null; `city`/`region` string; `preferredFormats` an array in `['singles','doubles','mixed']`; `playStyle` in `['competitive','social','training']`; `privacyLevel` in `['private','public']`. Covered in `user.router.test.ts` via a parameterized `it.each` over invalid values per field, plus a test confirming out-of-set fields are silently dropped rather than rejected.

**State field is a searchable `Combobox`, constrained to real US states — not free text.** `src/client/src/lib/us-states.ts` exports the 50 states + DC; `region` city stays free-text. Client-side constraint only — tightening the server check to an enum was considered and skipped, since state codes aren't currently used in any query logic — revisit if state-based filtering gets built.

**Logout** (`supabase.auth.signOut()`, then `router.replace('/')`) sits inline next to "Edit profile" in view mode. Styled `variant="destructive"` with a `LogOut` icon.

**Admin link** — same account-action row, between "Edit profile" and "Log out." Fetched via `GET /api/admin/me`; rendered only when the caller has any `AdminRole`.

**`/home`'s dashboard widgets — reuse `GET /api/sessions`, no new endpoints.** "Next session" fetches `attendee_id=<self>&status=upcoming` and `organizer_id=<self>&status=upcoming` in parallel and takes the earliest `startsAt` across both (merge/sort happen client-side). "Recent activity" fetches `attendee_id=<self>&status=completed`. Both are wrapped in a `next/link` `Link` — fixed after shipping as a click-through-to-nothing gap.

**"Friends activity" is a placeholder, not real data.** No followers/friends relationship in the schema, so the dashboard section is an empty "coming soon" state rather than fabricated content. Wire this up once a followers/friends concept actually exists; don't approximate it with session co-attendees.

---

## Security Headers & CORS

**CORS — API-side, `src/server/src/index.ts`.** Explicit allow-list read from `ALLOWED_ORIGINS` (comma-separated, no wildcard support), defaulting to `http://localhost:3000,http://127.0.0.1:3000` in dev. Also restricts `allowMethods` to `['GET','POST','PATCH','DELETE']` and `allowHeaders` to `['Content-Type','Authorization']`.

**Both `localhost` and `127.0.0.1` need their own CORS entry — CORS checks the browser's `Origin` header, not the destination.** A browser that navigated to `http://127.0.0.1:3000` sends `Origin: http://127.0.0.1:3000` — a distinct string from `http://localhost:3000` as far as the allow-list's `.includes()`-style check is concerned. Missing the `127.0.0.1` entry surfaces as every API-backed page failing with a browser-console CORS error while the exact same page works fine under `localhost`. Same root cause as Auth's `site_url`/`127.0.0.1` note.

**Cache-Control — API-side, `src/server/src/middleware/no-store.ts`.** `noStore` middleware sets `Cache-Control: no-store` + `Pragma: no-cache` on every `/api/*` response — prevents an intermediary from caching a response fetched under one caller's `Authorization` header and serving it to a different caller.

**Optional-auth resolution — `getOptionalUserId(c)` in `src/server/src/middleware/auth.ts`.** For routes that behave differently for logged-in vs. anonymous callers without requiring auth outright — resolves to `undefined` rather than rejecting when no token is present. Follow this pattern for any future optional-auth need instead of reaching for `supabase` directly in a router.

**Content-Security-Policy — client only, Report-Only for now.** Set via `headers()` in `src/client/next.config.ts`. Directives: `default-src 'self'`, `script-src 'self'`, `style-src 'self'` (no `'unsafe-inline'`), `img-src 'self' data:'`, `font-src 'self'`, `connect-src 'self' <SUPABASE_URL> <API_URL>`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. Report-only, no `report-uri`/`report-to` yet — violations only surface in devtools during manual QA. Will need revisiting once `messaging` (Stream Chat) is implemented — the client SDK will need its own `script-src`/`connect-src`/`wss:` origins.

---

## Rating System

**Implementation split.** Implemented in `src/server/src/domains/rating/`. Core scoring (`computeRatingUpdate`, `toRatingDisplay`) lives in `rating.algorithm.ts` — pure, no Supabase import — re-exported from `rating.service.ts`, which adds DB orchestration. The algorithm is unit-testable and runnable standalone (`rating.demo.ts`) without a DB connection.

**Scope note: `verification_requests` evidence-review flow is not implemented.** Nothing reads or writes that table; the `/admin` Verification tab is a static placeholder. `PATCH /api/users/:id/verify` (admin+) is a direct shortcut that toggles `verified_tier`/`rating_floor` immediately, skipping evidence review entirely.

**Session eligibility precondition.** Before any duplicate/participant checks, `submitRating` fetches the session's `starts_at`/`status` and rejects with `session_not_eligible` if the session is `cancelled` or hasn't started yet.

**Duplicate-vote race.** `submitRating`'s duplicate check is an app-level pre-read of `session_rating_submissions` before insert, not a DB-level catch — the table's `UNIQUE(session_id, rater_id, ratee_id)` constraint is the actual backstop. Two concurrent submissions can both pass the pre-check; the insert's error is checked and treated as `{ reason: 'duplicate' }` so the loser aborts before any score-update logic runs. Only reproduces against a real unique-constraint violation, not the mocked unit suite.

**Data model notes:** vote attribution is never exposed via the API, not even to the ratee — `session_rating_submissions` is write-only through the rating domain's endpoints; `GET /api/ratings/user/:userId/history` (self-only) surfaces only aggregated `score_before/score_after/delta`, never which rater(s) drove it. Full rating history is kept per user for audit/appeals/anomaly detection.

**Anomaly detection (flag for review, not a block).** `session_rating_submissions.flagged = true` when `|raterScore - rateeScore| > 2.0` grades. Out of scope/deferred: same rater-ratee pair exceeding N sessions without fresh raters, coordinated voting pattern detection, global distribution recalibration — these need batch/cron analysis.

**Distribution calibration.** Target: slightly right-skewed normal, bulk of active users landing 3.5–4.5. May need a global recalibration mechanism if the distribution drifts (grade inflation) — not implemented; would be a periodic admin/cron job.

**Onboarding quiz implementation detail.** 4 self-reported multiple-choice questions, each option mapped to a fixed score in `ONBOARDING_OPTION_SCORES`. `computeOnboardingScore` averages the 4 mapped values and rounds to 2dp; returns `null` (→ `400 invalid_answers`) if any key is missing/unrecognized. Calibration is approximate, same caveat as distribution calibration above. Write path (`submitOnboardingQuiz`/`skipOnboarding`) goes through a shared `completeOnboarding` helper — a claim-style atomic `UPDATE profiles SET internal_score, onboarding_completed_at = now() WHERE ... AND onboarding_completed_at IS NULL`; a 0-row result means onboarding was already completed (`409`). This race is verified against a real Postgres instance (`rating.integration.test.ts`), firing two concurrent calls and asserting exactly one wins. Audit trail: `onboarding_quiz_responses` (best-effort insert, never read back). Avoids a login-time fetch: `completeOnboarding` also best-effort syncs `app_metadata.onboarding_completed = true` via `supabase.auth.admin.updateUserById`, so `login/page.tsx` and the quiz page's guard both read it synchronously off the already-fetched session/response with zero extra requests. `profiles.onboarding_completed_at` stays the single authoritative source.

**Bug found & fixed: onboarding quiz appeared to loop forever after completion.** Before `finishWith` called `refreshSession()`, `getSession()` kept returning the pre-onboarding token (with `onboarding_completed` absent from `app_metadata`) until its next natural refresh — up to ~1hr TTL. `finishWith`'s `router.replace('/home')` would land on `/home`, whose `useRequireAuth` guard read that same stale session and immediately bounced back to `/onboarding/quiz`, which re-rendered the quiz from step 1 with no indication anything had succeeded. Shipped unnoticed because Playwright's `waitForURL('/home')` resolves on first match and doesn't catch the subsequent bounce — `onboarding-quiz.spec.ts` now waits an extra beat and re-asserts the URL for exactly this reason.

---

## Environments

**Local dev / prod.** `supabase start` spins up a full Postgres + Auth + Studio stack in Docker; URLs/keys are printed on startup and copied into `src/client/.env.local`/`src/server/.env.local` (gitignored). Prod env vars live in each service's own dashboard only — server vars in Render, client (`NEXT_PUBLIC_*`) vars in Vercel. The prod Supabase project is linked once via `supabase link --project-ref <ref>`.

**Data API grants for tables — historical, now handled automatically.** Newly created tables aren't auto-exposed to Data API roles by default (`config.toml`'s `auto_expose_new_tables`, off by default). Without an explicit `GRANT`, even `service_role` got "permission denied" on a brand-new table via `supabase-js`/PostgREST — confirmed against a live local instance. `20260630160450_grant_service_role_access.sql` granted `service_role` access on the schema as it stood at that point, plus `ALTER DEFAULT PRIVILEGES` so future tables inherit it automatically — this gotcha shouldn't recur.

**App deployment.** Render (server) and Vercel (client) both watch the repo and auto-deploy on push to `main`, independently of each other. No separate deploy step.

---

## Testing

**Unit suite (`npm test --workspace=server`).** Every `*.service.test.ts`/`*.router.test.ts` mocks `lib/supabase.ts`'s `supabase.from()` entirely — fast, no Docker, verifies branching/row-mapping logic given an assumed DB response shape. Scoped via `vitest.config.ts`'s `include`, so it never touches `src/__integration__/`.

**Integration suite (`npm run test:integration --workspace=server`).** Runs the real `*.service.ts` code against a real local Postgres — for the class of bug mocks structurally can't catch (constraint violations, real PostgREST response shapes, untested migrations). Deliberately light: a couple of targeted tests, not a parallel copy of the unit suite. Requires `supabase start` + `.env.local`. Separate `vitest.integration.config.ts` (`fileParallelism: false`) so the default `npm test` stays Docker-free.

**Fixtures (`src/server/src/test/integration-helpers.ts`).** `profiles.id` references `auth.users(id)`, with a trigger auto-creating the `profiles` row on insert — test users must go through `supabase.auth.admin.createUser(...)`, never a direct `profiles` insert. `createTestUser` wraps that plus an optional `profiles` patch (e.g. `placementSessionsRemaining: 0`, or `firstName`/`lastName`/`verifiedTier` for `profiles_verified_requires_name` CHECK constraint tests).

**Frontend e2e (`npm run test:e2e --workspace=client`).** Playwright, configured in `src/client/playwright.config.ts`. `webServer` auto-starts `next dev` if nothing's already listening (`reuseExistingServer: true` outside CI). Two projects run every spec: `chromium` (desktop) and `mobile-chromium` (`Pixel 7` viewport). Only Chromium is installed locally.

**Isolation — truncate via a direct `pg` connection, not transaction rollback.** PostgREST executes each HTTP request as its own transaction, so multi-call flows like `submitRating` can't be wrapped in one outer transaction without bypassing PostgREST. Instead, `afterEach` runs `TRUNCATE TABLE auth.users, venues CASCADE` over a raw `pg.Client` (used only for this, never by code under test) — `CASCADE` follows the FK graph without hand-maintaining a deletion order; `venues` is listed explicitly since unclaimed venues aren't reachable from `auth.users`. No `RESTART IDENTITY` — every table uses a uuid PK, and the local `postgres` role isn't a true superuser.

---

## Database Logic

**Venue availability lookup (two-step) — not yet implemented.** `venue.service.ts` currently returns raw `venue_hours` rows as-is; nothing applies this lookup logic, and `venue_date_exceptions` isn't read or written anywhere in code yet. Intended logic: check `venue_date_exceptions` for the exact date first (null `open_time` means fully closed, non-null times override); fall back to `venue_hours` for that `day_of_week` if no exception row.

**Venue hours granularity.** `venue_hours` uses day-of-week only. "1st and 3rd Tuesday" patterns are out of scope for v1 — `venue_date_exceptions` handles one-offs, weekly schedules cover the vast majority of real venues at launch.

**Write access for `venue_date_exceptions` (not yet implemented — no endpoint exists).** Intended to be claimed venue accounts only; unclaimed venues, platform admins only.

**Rating display derivation** is always computed server-side from `internal_score`, never exposed as a raw float except to admin+ via `?raw=true` and the adjust-rating endpoint's response.

**Admin access check** is not an RLS policy (none exist in this schema) — enforced in service-layer code via the role model.

---

## Admin & Roles

**`src/server/src/lib/admin.ts`** — shared infra, not a domain: `getAdminRole(userId)` (single PK-indexed query) and `roleAtLeast(role, min)`. `AdminRole` is exported from `@pavilion/types`; the client keeps a pure mirror of `roleAtLeast` in `lib/admin-role.ts` for UI-gating only — the server always re-checks every action.

**Per-domain override detail:**
- **`venue`** — `createVenue` always writes an `admin_venue_edits` row (`action: 'create'`); `updateVenue` writes one (`action: 'edit'`) only on its `admin` branch, never the claimed-owner branch, pre-fetching the row so `buildVenueChanges` can diff whichever fields the patch touched.
- **`user`** — `searchUsers` (moderator+) bypasses the private-profile filter, capped at 50 rows. `updateUser` takes `opts?: { bypassNameLock?, performedBy? }`, set when a moderator+ patches someone else, pre-fetching the profile for a diff and writing an `admin_user_edits` row; a self-edit skips both. `setVerifiedStatus` is a separate action, not on `updateUser`'s field whitelist.
- **`session`** — `GET /api/sessions?admin=true` (moderator+) only resolves the caller's role when present, so an ordinary browse request never pays for the lookup. `listSessions`'s `adminOverride` branch is a separate code path, capped at 50 rows. `PATCH`/`DELETE`/`PATCH :id/status`/`POST :id/attendance` each resolve `isModerator` internally and log an `admin_session_edits` row only on that branch — an organizer acting on their own session (even if also a moderator) isn't logged. `GET /:id/rsvps?admin=true` (moderator+) works the same way for the roster: bypasses the going/waitlisted-only filter and the private-name filter, so `AdminSessionsPanel` can show every attendee (including `cancelled`/`attended`/`no_show`) with their real name. `DELETE /:id/rsvps/:userId` (moderator+, no self-service equivalent) removes another player's RSVP — restricted to `upcoming` sessions only and always logged, since there's no non-admin branch to compare against; deliberately skips the late-cancel reliability penalty `cancelRsvp` applies, since that penalty represents the player's own choice, not a moderator's.
- **`rating`** — `POST /user/:userId/adjust` clamps the same way the live algorithm clamps, writes via optimistic CAS (`UPDATE ... WHERE internal_score = :scoreAtReadTime`), a 0-row result returns `409 concurrent_modification`. Inserts a `rating_history` row (`session_id: null`, `performed_by: callerId`) so manual overrides share the peer-vote audit trail.

**Every audit insert is best-effort with logging, never a silent failure.** Every audit insert (`admin_role_changes`, `admin_user_edits`, `admin_session_edits`, `admin_venue_edits`, `rating_history.performed_by`) checks its own error and `console.error`s it with context if it fails, without failing the primary write. A failed audit insert means a gap in the History tab, not a failed admin action.

**Gotcha found while building this: PostgREST embed shorthand breaks when a table has two FKs to the same target.** `admins` has both `user_id` and `granted_by` referencing `profiles(id)` — the plain embed shorthand returned PostgREST error `PGRST201`, which `listAdmins`/`setAdminRole` were silently swallowing into an empty-array success response — so the bug surfaced as an always-empty Roles tab, not a visible error. Fixed by disambiguating with PostgREST's `!<fkey_name>` syntax. The same shape recurs in `admin_role_changes`, `admin_user_edits`, and `rating_history` — `listAdminHistory` disambiguates all three with aliased `!<fkey_name>` patterns.

**Unified admin History tab — `listAdminHistory`, `GET /api/admin/history`.** One merged, newest-first feed of every admin-override action across domains. Visibility is role-scoped, not owner-only — a caller sees an entry type iff their role outranks that type's minimum gating tier (venue_verifier: venue; moderator+: adds user/session; admin+: adds rating; owner+: adds role). Each of the (up to) five source queries runs in parallel, capped at 50 rows each; the merged result is sliced to the top 50 overall.

**Every entry carries full before/after field values.** `user`/`venue`/`session` `edit` actions diff the request body against a pre-fetched "before" snapshot; `venue create` and `session mark_attendance` use synthetic single-field entries; `session cancel`/`advance_status` build a synthetic `status` entry; `role` and `rating` map their already-stored before/after columns directly.

**History-tab diffs were originally omitted, then added back.** An earlier version deliberately omitted diffs ("who did what to whom, when" only), but that made every user-edit entry read as undifferentiated "X edited Y" with no way to tell what changed — reversed once that gap showed up in practice.

**This replaced the standalone `GET /api/admin/role-changes` endpoint** (and `listRoleChanges`, and the Roles tab's "Role change history" section) — that data now flows through `/api/admin/history` instead.

**`/admin` client page** — reached only via a link on `/profile`, not added to `AppNav`. Tabs (Venues/Users/Sessions/Verification/Roles/History) follow `/sessions`' button-row pattern, each gated client-side by `roleAtLeast` for UI purposes only.

**No standalone Ratings tab** — adjusting a rating always starts with finding the target user via the Users tab's search. `AdminUsersPanel`'s edit view folds in a Rating section (raw score + adjust form) that only renders for admin+.

**Admin panel searches are debounced, not submit-driven** — `AdminUsersPanel`, `AdminSessionsPanel`, `AdminUserPicker` all follow `SessionFilters`' 400ms debounce pattern, no explicit Search button.

**Client — Verified checkbox save-ordering.** The "Verified" checkbox sits inside the profile-edit form, above "Save changes," so one save updates profile fields and `verified_tier` together. This replaced an earlier version where toggling Verified was its own instant, separate request: since the profile form's save always closed the edit panel regardless of the toggle's outcome, an admin who typed in a missing name and toggled Verified had to reopen the row to retry. `handleSave` now sequences the two `PATCH` calls by direction — profile-then-verify when turning on, verify-then-profile when turning off — so clearing the name in the same submission never trips the DB constraint.

**Verification approval action detail.** `setVerifiedStatus` checks the name requirement itself before writing (`400 name_required`) rather than letting the write fail on the raw constraint violation. Clearing the name while staying verified still hits the DB constraint on both edit paths — `bypassNameLock` only skips the app-layer check, not `profiles_verified_requires_name`; `updateUser` detects the `23514` error code and returns `{ reason: 'verified_requires_name' }` instead of falling through to a generic `not_found`. Covered by mocking a `{ code: '23514' }` Postgres error in `user.router.test.ts`/`user.service.test.ts`.

**Claim-style writes (race-safe).** A "claim" or other check-then-act write should be a single atomic `UPDATE ... WHERE <precondition>` rather than a separate `SELECT` followed by an unconditional `UPDATE` — see `venue.service.ts`'s `claimVenue`/`updateVenue`. A 0-row result means the precondition failed at write time, including races against other concurrent writers.

**`seed-admins.ts`'s re-run can hit KI-004 on the `admins` table itself.** `admins.user_id REFERENCES profiles(id)` has no `ON DELETE CASCADE` (see the initial-schema migration) — so `deleteExistingSeedData`'s `supabase.auth.admin.deleteUser(...)` call can 500 with `admins_user_id_fkey` when Postgres tries to cascade `auth.users → profiles` but then can't cascade `profiles → admins`. Same root cause as KI-004 ("admin grants" is explicitly named there), just surfacing through the seed script instead of the real account-deletion feature. Not fixed here since KI-004 itself is deferred — if it recurs, the workaround is deleting the `admins` row for each seed admin before calling `deleteUser`, same pattern `seed-sessions.ts`/`seed-venues.ts` already use for their own non-cascading FKs (`sessions.organizer_id`, `sessions.venue_id`, `admin_session_edits.session_id`).

**User profile fields not yet exposed.** `getUserById`/`updateUser` only select/return the `User` shape — `profiles.reliability_score`/`session_count` exist in the schema but aren't selected by either function. `UserProfile` (extends `User` with `rating`/`reliabilityScore`/`sessionCount`) is declared but no service function builds one yet.

---

## Session & Venue

**`venues.lng`/`lat` are stored, unlike other derived values — and that's fine.** They're `STORED GENERATED` columns Postgres keeps in lockstep with `location` on every write — they can't drift, and exist only to dodge a wire-format problem (PostgREST returns `geography` as an EWKB hex string). Not license to start storing other derived values. `distanceMiles` is the opposite case — never stored, computed fresh per request.

**Venue distance search — `nearby_venues` RPC, called via `supabase.rpc(...)` from `listVenues`.** Activated by `GET /api/venues?lat=&lng=&radius_miles=`; when absent, falls back to a plain filtered `.select()`. Doesn't join `venue_hours` — only `/venues/[id]`'s separate call needs per-day hours. Locked down to `service_role` only, for consistency with this codebase's "every new function defaults to `PUBLIC` execute unless revoked" convention. Distance is returned in miles, converted server-side from the RPC's `distance_meters`.

**PostGIS gotcha: `ST_MakePoint` alone isn't enough.** `ST_MakePoint(lng, lat)` produces a geometry with SRID 0 (no coordinate system) — casting that directly to `geography` fails/misbehaves. The fix is `ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography`, matching the `venues.location` column's own type. Caught and fixed during code review; verified against real PostGIS in `venue.integration.test.ts`.

**Geolocation permission is requested lazily, not on page load.** `use-geolocation.ts`'s `useGeolocation()` starts at `'idle'` and only calls `navigator.geolocation.getCurrentPosition` when its returned `request()` is invoked. The Distance `<select>` calls it the moment the admin picks an actual radius. The picked radius is held in local state until geolocation resolves: applied on `'granted'`, discarded on `'denied'`/`'unsupported'`.

**Google Places (New) address autocomplete — admin venue-creation only.** `venue.places.ts` (pure, no Supabase import) wraps Google's Autocomplete (New) and Place Details (New) REST endpoints, called server-side — kept server-side to keep the API key out of the browser and avoid a CSP exception. Session-token handling follows Google's session-based billing model. Degrades gracefully without a key: both functions return `{ configured: false }` before ever calling `fetch` when `GOOGLE_PLACES_API_KEY` is unset. Response shapes are the **New** Places API's — don't mix up with the legacy field names if extending this. Selecting a suggestion auto-populates `address`/`city`/`region`/`lat`/`lng`; `lat`/`lng` aren't shown as manual fields at all.

**Picking a Places suggestion moves focus to Court count, not just closing the dropdown.** `onSelect` fires synchronously the instant a suggestion is clicked. Setting `address` to the picked text would otherwise re-trigger the debounced autocomplete-search effect and fire a second, wasted billed Places call — guarded by a `lastPickedTextRef`.

**Venue required-field validation (`venue.router.ts`'s `validateVenueFieldValues`).** Mirrors `session.router.ts`'s equivalent. The `venues` table only enforces `NOT NULL` at the DB level, which doesn't catch an empty string or a `courtCount` of `0` — `POST /` rejects a request missing any required field outright, and both routes reject present-but-invalid fields. The admin form's HTML `required` attributes are a UX nicety on top of this, not the actual guarantee.

**`seed-venues.ts`'s cleanup must delete sessions before venues — and now `admin_session_edits` before sessions.** `sessions.venue_id` is a nullable FK with no `ON DELETE` clause (not `CASCADE`, not `SET NULL`), so once `seed-sessions.ts` started linking its sessions to real seeded venues, re-running `seed:venues` standalone started failing with a FK violation on delete. Fixed by having `seed-venues.ts`'s cleanup delete any `sessions` rows pointing at the venues it's about to remove first — which also means re-running `seed:venues` alone wipes out `seed:sessions`' data and it needs a re-run afterward (`seed:all` already runs venues before sessions for this reason). One layer deeper: `admin_session_edits.session_id` also has no cascade, so exercising the admin sessions panel's Players section (`removeRsvp`, etc.) against a seeded session leaves an audit row that then blocks deleting that session too — both `seed-venues.ts` and `seed-sessions.ts`'s cleanup now delete any `admin_session_edits` rows for the sessions they're about to remove, before removing them.

**Venue hours are admin/owner-editable, not just seed-only.** `admin-venues-panel.tsx`'s edit/create form includes `contactPhone`/`contactWebsite`/`bookingUrl` and a per-day-of-week hours editor — previously `venue_hours` rows only existed via `seed-venues.ts`. Each open/close control is a `TimeOfDayPicker` — a compact popover opening into the same quick-tap time-of-day pills `starts-at-picker.tsx` uses, so both read as one picker style. `venue.service.ts`'s `replaceVenueHours` does a full delete-then-insert rather than a per-day upsert — the table has no unique constraint on `(venue_id, day_of_week)` to upsert against, and the edit form always resubmits the complete weekly schedule anyway.

**Session domain scope notes.** `organizer_id` is always required — even drop-in sessions need a poster; venue-owned standing sessions can be created by admins with their own `organizer_id`. Recurring sessions: `is_recurring`/`recurring_cron_expr` are stored on create, but child-session auto-spawning is deferred (no cron job yet). `profiles.session_count` isn't incremented by the RSVP flow — needs a separate post-session reconciliation process, not yet built. No-show marking is manual (`POST /:id/attendance`); automatic no-show detection is a separate background-process concern.

**RSVP & attendance concurrency safety — implemented as Postgres functions, called via `supabase.rpc(...)`.** Naive read-then-write JS for capacity checks, waitlist promotion, and reliability-score deductions is racy under concurrent requests. `join_session_atomic` locks the `sessions` row (`FOR UPDATE`), counts `going` RSVPs, and inserts/upserts in one transaction. `cancel_rsvp_and_promote` takes the same lock, cancels the RSVP and promotes the oldest waitlisted row in the same transaction — but skips promotion when the session is `cancelled`/`completed`, since promoting onto a dead session would create a phantom RSVP that could later earn a no-show penalty. Deliberately avoids `SELECT ... FOR UPDATE SKIP LOCKED` on the waitlist row — if the lock-holding transaction had rolled back, `SKIP LOCKED` would already have promoted a lower-priority user, permanently breaking FIFO order. `decrement_reliability_score` applies `GREATEST(0, reliability_score - points)` in a single `UPDATE`. All three are `SECURITY DEFINER`, locked to `service_role` only.

**`markAttendance` has its own JS-level version of this problem.** The read of `going` RSVPs used to decide who attended/no-showed and the writes that flip their status aren't one atomic unit — two overlapping calls could both read the same snapshot and both fire the no-show penalty. Fixed without a new RPC: both update queries add `.eq('status', 'going')` and `.select('user_id')`, so each call only sees the rows *it* actually flipped, and the penalty/counts are computed from that returned set.

**`cancelRsvp`'s late-cancel penalty RPC is best-effort once the cancel itself has committed.** If `decrement_reliability_score` errors after `cancel_rsvp_and_promote` already succeeded, the function logs the error and returns `{ ok: true, warning: 'penalty_not_applied' }` rather than reporting the cancel as failed — the RSVP really is cancelled at that point. `markAttendance`'s no-show branch instead returns `{ ok: false, reason: 'write_failed' }`, since nothing there has an equivalent "already committed" constraint. Verified against a real concurrent race (not just mocked RPC calls) in `session.integration.test.ts`.

---

## Messaging

**v1 scope:** session-scoped group chat only (organizer + attendees). No open DMs in v1. Recommended provider: Stream Chat — pre-built React components, generous free tier, scales well, handles real-time/push/storage/moderation primitives. Alternatives considered: Firebase Realtime Database (more custom UI work, very cheap), Sendbird (more enterprise, pricier). Channel ID convention: Stream channel IDs are derived as `session_{session_id}` — no `stream_channel_id` column on `sessions`, always reconstructible from the session UUID. DM system is a future feature — keep the messaging domain cleanly separated from session domain so it can be extended.
