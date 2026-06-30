# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading before touching schema, scope, or architecture

- [brainstorm.md](brainstorm.md) — product/feature decisions, open questions, rationale behind feature scope
- [database-schema.md](database-schema.md) — full table definitions, indexes, what's intentionally excluded
- [technical-notes.md](technical-notes.md) — architecture decisions, stack rationale, lookup logic, derivation formulas, access control rules

These three files are the source of truth for product and technical decisions — check them before proposing changes that touch schema, scope, or architecture. Keep them updated when decisions in these areas change; don't let them drift from the code.

**End of every session:** re-read all three files and check them for consistency — with each other and with the code/migrations as they now stand. Fix anything that's drifted before considering the session finished: stale "not yet implemented" notes that are now done, formulas or field names that no longer match the code, dangling cross-references, domain-status lists (like the one below) that don't reflect what was just built.

## Commands

All app commands run from `src/` (the npm workspaces root — not the repo root).

```bash
cd src && npm install              # install all workspaces

npm run dev                        # run client + server together
npm run build                      # build all workspaces
npm run typecheck                  # typecheck all workspaces

# Server only (src/server)
npm run dev --workspace=server     # tsx watch, loads .env.local
npm test --workspace=server        # vitest run (mocked unit tests, no Docker needed)
npx vitest run src/domains/user --workspace=server    # one domain
npx vitest run -t "test name"      # by test name
npm run test:integration --workspace=server   # real-Postgres tests, needs `supabase start` + .env.local — see technical-notes.md "Testing"

# Client only (src/client)
npm run dev --workspace=client     # next dev --turbopack, localhost:3000
```

There is no lint script configured in this repo.

Database (run from repo root, not `src/`):

```bash
supabase start                     # local Postgres + Auth + Studio (Docker)
supabase migration new <name>      # scaffold supabase/migrations/<timestamp>_<name>.sql
supabase db reset                  # replay all migrations locally — smoke test before committing
supabase db push                   # apply pending migrations to the linked prod project
```

See [README.md](README.md) for full local setup (env files, ports) and prod deployment steps.

## Architecture

**Modular monolith.** One Hono server (`src/server`), one Next.js app (`src/client`), shared types in `@pavilion/types` (`src/packages/types`). Routers are mounted in [src/server/src/index.ts](src/server/src/index.ts) under `/api/<domain>`.

**Domain boundaries — no cross-domain imports:**

| Domain | Responsibility |
|---|---|
| `user` | Auth, profiles, privacy settings, verification |
| `venue` | Listings, geospatial search, discovery |
| `session` | Creation, RSVPs, scheduling, payments, shuttle calc |
| `rating` | Score calculation, history, locks, anomaly detection |
| `messaging` | Thin wrapper over Stream Chat (session-scoped group chat) |
| `marketplace` | Stub only, deferred — don't implement or reference from other domains |

Each domain under `src/server/src/domains/<name>/` follows `<name>.router.ts` (Hono routes, owns the `auth` middleware and request/response shape) + `<name>.service.ts` (Supabase queries, row↔domain-type mapping, business rules), with tests in `__tests__/`. `user`, `venue`, and `rating` are implemented; `session` and `messaging` are router-only stubs awaiting implementation — follow the same router/service split when filling them in. (`rating`'s `verification_requests` approve/reject flow is not yet built; `venue`'s proximity/radius search and its `venue_hours`/`venue_date_exceptions` availability lookup are not yet built either — `listVenues` only filters by city/type/drop-in availability — see technical-notes.md for both.)

**Row mapping convention:** services define a private `*Row` type matching the snake_case DB columns, and a `to<Type>()` function that maps it to the camelCase type exported from `@pavilion/types`. Routers never see raw DB rows.

**Auth:** [src/server/src/middleware/auth.ts](src/server/src/middleware/auth.ts) validates the bearer token via Supabase and sets `userId` in Hono context (`c.get('userId')`). Any new authenticated router applies this middleware with `router.use(auth)`.

**Supabase client:** [src/server/src/lib/supabase.ts](src/server/src/lib/supabase.ts) uses the service-role key — it bypasses RLS, so authorization (ownership checks, private-profile visibility, etc.) must be enforced in service-layer code, not assumed from RLS policies.

**Derived values are computed server-side, never stored:** rating tier/subtier from `internal_score` (implemented). Shuttle cost per person from session params follows the same principle once `session` is built — it's currently a router-only stub, so this isn't implemented yet. See technical-notes.md for the exact formulas — don't re-derive them from scratch or cache them in a column.

**Marketplace is a deferred bounded domain.** Don't add marketplace concepts (shop, inventory, listing, order, commission) to `session`, `venue`, or `user` models, even as optional fields.