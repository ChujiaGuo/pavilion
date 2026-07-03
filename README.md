# Pavilion

A platform for organizing badminton get-togethers — venue discovery, skill-matched sessions, and peer-based player ratings.

---

## Repository Structure

```
/
├── CLAUDE.md             # Instructions for Claude Code when working in this repo
├── brainstorm.md         # Product brainstorming notes, feature decisions, future features roadmap
├── design-system.md      # Front-end design decisions: component library, UX/copy principles
├── technical-notes.md    # Architecture decisions, stack rationale, technical specs
├── database-schema.md    # Full database table definitions and indexes
├── supabase/
│   └── migrations/       # SQL migrations, committed to git — see "Database migrations" below
└── src/                  # Application code (Pavilion)
    ├── package.json      # Monorepo root — npm workspaces
    ├── packages/
    │   └── types/        # @pavilion/types — shared TypeScript types used by client and server
    ├── client/            # @pavilion/client — Next.js frontend (TypeScript, Tailwind)
    │   ├── playwright.config.ts
    │   └── e2e/           # Playwright e2e specs — see "Testing" below
    └── server/            # @pavilion/server — Node/Hono backend (TypeScript)
        └── src/
            ├── domains/    # user, venue, session, rating, messaging, marketplace — see technical-notes.md "Architecture" for responsibilities
            └── __integration__/, test/  # Integration tests + fixtures against real Postgres — see "Testing" below
```

## Getting Started

**Prerequisites:** Node ≥ 22, Docker (for Supabase local dev)

```bash
# 1. Install dependencies
cd src && npm install

# 2. Start local Supabase (Postgres + Auth + Studio)
cd .. && supabase start
# Copy the printed anon key and service role key into the env files below

# 3. Set up environment variables
cp src/client/.env.example src/client/.env.local
cp src/server/.env.example src/server/.env.local
# Fill in the values from step 2

# 4. Start the app
cd src && npm run dev
```

Client runs on `http://localhost:3000`, server on `http://localhost:4000`, Supabase Studio on `http://localhost:54323`. Local Supabase doesn't send real email — auth emails (e.g. the `/forgot-password` reset link) land in the local inbox UI at `http://localhost:54324` instead.

`src/server/.env.local`'s `ALLOWED_ORIGINS` (comma-separated, no wildcard support) gates which origins the API's CORS policy accepts — it defaults to `http://localhost:3000`. If you're testing from another device on your network (e.g. a phone hitting the dev server by LAN IP), add that origin too, e.g. `ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.45:3000`.

That LAN origin only covers requests *to* the API. The client's own `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_URL` (`src/client/.env.local`) are baked into the browser bundle, so a phone loading the page via LAN IP still tries to reach whatever host those vars name — left as `localhost`/`127.0.0.1`, that resolves to the phone itself and every auth/API call fails immediately with a network error (`TypeError: Load Failed` on Safari). Point both at the same LAN IP instead (Supabase's local Kong gateway publishes on `0.0.0.0:54321`, so it's reachable): `NEXT_PUBLIC_SUPABASE_URL=http://192.168.1.45:54321`, `NEXT_PUBLIC_API_URL=http://192.168.1.45:4000`. Restart the client dev server after changing these — Next.js inlines `NEXT_PUBLIC_*` vars at startup, not per-request.

## Enabling Google sign-in (optional)

Email/password auth works out of the box. Google is scaffolded in code (see `technical-notes.md` "Auth") but disabled by default since it needs real OAuth credentials:

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (type: Web application). Add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI for local dev.
2. Export the resulting client ID/secret as env vars before running `supabase start`: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
3. Flip `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, then `supabase stop && supabase start` to pick it up.
4. For prod, add the same client ID/secret in the Supabase dashboard (Authentication → Providers → Google) with a redirect URI pointing at the prod project, instead of using `config.toml`.

**⚠️ `supabase/config.toml` is committed to git — step 3 is not a personal setting.** Flipping `enabled = true` and committing it turns Google sign-in on for every teammate and CI run, not just your machine. If they don't also have the two env vars from step 2 available wherever they run `supabase start`, their local stack breaks on a setting they never asked to enable. Don't commit `enabled = true` until the credentials are distributed somewhere every developer/CI can reach (a shared secrets manager, CI secret store, etc.) — if you're only testing locally, flip it back to `false` before committing.

## Database migrations

```bash
supabase migration new <name>   # create supabase/migrations/<timestamp>_<name>.sql
supabase db reset               # reset local DB and replay all migrations (smoke test)
supabase db push                # apply pending migrations to the linked prod project
```

Migrations live in `supabase/migrations/` and are committed to git. `db push` only runs migrations not yet applied to the remote — safe to run repeatedly.

## Seeding local test data

```bash
npm run seed:sessions --workspace=server   # needs `supabase start` + src/server/.env.local, same as `dev`
```

Creates a login-ready test account (`testuser123@example.com` / `password`) plus six supporting mock users, and nine mock sessions spanning the full skill-rating scale (including the documented floor/ceiling boundaries — see `technical-notes.md`'s "Rating System") with the test user as host on some, attendee/waitlisted/attended on others. Venue names are all prefixed `[SEED]` for easy identification. Safe to re-run — it deletes and recreates everything it owns (matched by its fixed list of emails) rather than accumulating duplicates. See `src/server/src/scripts/seed-sessions.ts` for the exact spread.

## Testing

```bash
npm test --workspace=server              # mocked unit tests — fast, no Docker required
npm run test:integration --workspace=server  # real Postgres — needs `supabase start` + src/server/.env.local
npm run test:e2e --workspace=client       # Playwright e2e — auto-starts the Next.js dev server if one isn't already running
npm run test:e2e:ui --workspace=client    # same, in Playwright's interactive UI mode
```

The integration suite runs the actual service code against a local Postgres instance to catch what mocks can't (constraint violations, real PostgREST response shapes, untested migrations). See `technical-notes.md` "Testing" for how it's isolated and why it's structured this way, and for the Playwright setup (browsers, projects, config location).

## Production setup (one-time)

The server (`@pavilion/server`) deploys to Render; the client (`@pavilion/client`) deploys to Vercel. They're independent services with independent env vars and independent custom domains.

1. Create a Supabase cloud project at supabase.com
2. `supabase link --project-ref <your-project-ref>`
3. `supabase db push` — applies all migrations to prod for the first time
4. **Render (server):** connect the repo, set Root Directory to `src`, Build Command to `npm install && npm run build --workspace=server`, Start Command to `npm run start --workspace=server`. Add prod env vars in the Render dashboard (see `src/server/.env.example` for the full list). `ALLOWED_ORIGINS` must be the prod client's actual domain(s) (e.g. `https://<prod-client-domain>`) — not `localhost`. Update this value any time a prod/staging frontend domain is added or removed; no code change or redeploy needed, just the env var. Render auto-deploys on push to `main`.
5. **Vercel (client):** import the repo, set Root Directory to `src/client` (Vercel's npm-workspaces detection handles the monorepo install from there). Add prod env vars in the Vercel project's Environment Variables settings (see `src/client/.env.example`) — `NEXT_PUBLIC_API_URL` points at the Render server's URL (its default `*.onrender.com` URL, or a custom subdomain if you've given the server one). Vercel auto-deploys on push to `main`. Enable **Web Analytics** for the project (Vercel dashboard → Analytics tab) — the client already renders `<Analytics />` from `@vercel/analytics/next` in the root layout, so no further code change is needed once it's toggled on.
6. In the Supabase dashboard (Authentication → URL Configuration), set **Site URL** to the prod client's domain and add `https://<prod-client-domain>/**` to **Redirect URLs** — needed for the Google OAuth callback and the `/forgot-password` reset-link flow to land on the right page instead of silently falling back to Site URL with an unusable `?code=`. `supabase/config.toml`'s `additional_redirect_urls` only governs local dev; this dashboard setting is prod's equivalent and must use the same `/**` wildcard suffix (see `technical-notes.md` "Auth" for why the wildcard specifically matters).
7. Uncomment and fill in the `[remotes.production]` block near the end of `supabase/config.toml` with the project ref from step 2 and the same Site URL/Redirect URLs you set in step 6 — this is a safety pin, not a duplicate config path; see the inline comment above that block for why it's required before the next step.
8. `supabase config push` — pushes `config.toml`'s `[auth]` section (including the tuned `[auth.rate_limit]` values, and `[auth.captcha]` if that's ever enabled) to the linked prod project. Safe to re-run any time `config.toml`'s auth settings change, as long as the `[remotes.production]` block from step 7 stays in sync with step 6's dashboard values — if you ever change Site URL/Redirect URLs in the dashboard, update `[remotes.production]` to match before pushing again, or `config push` will overwrite the dashboard values with whatever's in `config.toml`. Also make sure `[auth.external.google] enabled` is back to `false` in the local file before pushing (see the comment above that block) — `config push` sends the whole `[auth]` section, including that local-only toggle.

Prod env vars never go in files — each service's own hosting dashboard only (Render for the server, Vercel for the client).

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (full stack) |
| Frontend | Next.js 15 + Tailwind CSS |
| Backend | Node.js + Hono |
| Database + Auth | Supabase (PostgreSQL) |
| Messaging | Stream Chat |
| Payments | Stripe (deferred to v2 — see brainstorm.md Future Features Roadmap) |
| Hosting | Render (server) + Vercel (client) |
