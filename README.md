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

## Testing

```bash
npm test --workspace=server              # mocked unit tests — fast, no Docker required
npm run test:integration --workspace=server  # real Postgres — needs `supabase start` + src/server/.env.local
npm run test:e2e --workspace=client       # Playwright e2e — auto-starts the Next.js dev server if one isn't already running
npm run test:e2e:ui --workspace=client    # same, in Playwright's interactive UI mode
```

The integration suite runs the actual service code against a local Postgres instance to catch what mocks can't (constraint violations, real PostgREST response shapes, untested migrations). See `technical-notes.md` "Testing" for how it's isolated and why it's structured this way, and for the Playwright setup (browsers, projects, config location).

## Production setup (one-time)

1. Create a Supabase cloud project at supabase.com
2. `supabase link --project-ref <your-project-ref>`
3. `supabase db push` — applies all migrations to prod for the first time
4. Add prod env vars to the Railway/Render dashboard (see `.env.example` files for the full list)
5. Connect the repo to Railway/Render — it auto-deploys on push to `main`
6. In the Supabase dashboard (Authentication → URL Configuration), set **Site URL** to the prod domain and add `https://<prod-domain>/**` to **Redirect URLs** — needed for the Google OAuth callback and the `/forgot-password` reset-link flow to land on the right page instead of silently falling back to Site URL with an unusable `?code=`. `supabase/config.toml`'s `additional_redirect_urls` only governs local dev; this dashboard setting is prod's equivalent and must use the same `/**` wildcard suffix (see `technical-notes.md` "Auth" for why the wildcard specifically matters).

Prod env vars never go in files — hosting dashboard only.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (full stack) |
| Frontend | Next.js 15 + Tailwind CSS |
| Backend | Node.js + Hono |
| Database + Auth | Supabase (PostgreSQL) |
| Messaging | Stream Chat |
| Payments | Stripe (deferred to v2 — see brainstorm.md Future Features Roadmap) |
| Hosting | Railway or Render |
