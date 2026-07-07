# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Document goals

Each root note document has a distinct job. Keep content in its matching file — if something drifts into the wrong one (a "why" ends up in README, implementation detail ends up in brainstorm, a roadmap item ends up in technical-notes, a one-time implementation footnote ends up in technical-notes instead of misc-tech-notes), move it during the end-of-session pass below.

- [brainstorm.md](brainstorm.md) — the project document: ideas, roadmaps, plans. Product/feature decisions, open questions, rationale behind feature scope, the Future Features Roadmap.
- [design-system.md](design-system.md) — front-end design decisions: visual/thematic choices, UI component library and conventions, UX and copy principles. Not product feature scope (brainstorm.md) or backend architecture (technical-notes.md) — page-specific implementation details live in the code itself.
- [technical-notes.md](technical-notes.md) — large decisions that affect the future of the project: architecture, stack choices, domain boundaries, API contracts, core business algorithms (e.g., live rating math), and known issues. The bar for an entry here is "would a future decision need to agree with this" — not implementation trivia. Only implemented features and features ready to be built in the current version — deferred features belong in brainstorm.md's roadmap, not here.
- [misc-tech-notes.md](misc-tech-notes.md) — one-time engineering decisions and granular implementation detail that won't need to be referenced again: historical bug-fix narratives, gotchas found while building something, local-dev environment quirks, local configuration warnings, and UI/implementation footnotes. Nothing here should be load-bearing for a future decision — if a note here keeps getting looked up in practice, promote it to technical-notes.md instead of leaving it here. **Not required reading** — see below.
- [database-schema.md](database-schema.md) — database organization: full table definitions, indexes, what's intentionally excluded. Tied to technical-notes.md, which it points to for lookup logic and derivation formulas.
- [README.md](README.md) — workflow: what you'd consult to set up a new machine, transfer hosting, run migrations, run tests. Not a place for rationale or architecture decisions — those belong in technical-notes.md.
- [CLAUDE.md](CLAUDE.md) — this file: guidance for Claude Code itself (document goals, commands, architecture summary). Kept in sync with the other six so instructions here never contradict what the code/docs actually say.

## Required reading

Read brainstorm.md, design-system.md, technical-notes.md, database-schema.md, README.md, and this file before implementing a feature, or before touching schema, scope, or architecture. They're the source of truth for product decisions, technical decisions, and operational workflow — check them before proposing changes in these areas.

**misc-tech-notes.md is not required reading.** Consult it only as a fallback — when you need a detail that isn't in technical-notes.md (a gotcha, a historical rationale, a local-dev config quirk), or before asking the user a clarifying question, since the answer may already be recorded there. Don't read it proactively at the start of a task the way the six required docs are read.

**End of every session:** re-read all seven files (including misc-tech-notes.md) and check them for consistency — with each other, with the code/migrations as they now stand, and with the document goals above. Fix anything that's drifted before considering the session finished: stale "not yet implemented" notes that are now done, formulas or field names that no longer match the code, dangling cross-references, domain-status lists (like technical-notes.md's domain-responsibility table) that don't reflect what was just built, content that's ended up in the wrong file, or a technical-notes.md entry that's actually one-time/historical (move to misc-tech-notes.md) vs. a misc-tech-notes.md entry that's become something future work actually depends on (promote to technical-notes.md).

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
npm run test:integration --workspace=server   # real-Postgres tests, needs `supabase start` + .env.local — see technical-notes.md "Environments & Testing"

# Client only (src/client)
npm run dev --workspace=client     # next dev --turbopack, localhost:3000
npm run test:e2e --workspace=client     # Playwright e2e, auto-starts the dev server if not already running
npm run test:e2e:ui --workspace=client  # same, interactive UI mode
```

There is no lint script configured in this repo.

Database (run from repo root, not `src/`):

```bash
supabase start                     # local Postgres + Auth + Studio (Docker)
supabase migration new <name>      # scaffold supabase/migrations/<timestamp>_<name>.sql
supabase db reset                  # replay all migrations locally — smoke test before committing
supabase db push                   # apply pending migrations to the linked prod project
```

See [README.md](README.md) "Database migrations" for the full migration workflow (when to run each command, in what order) and full local setup (env files, ports, prod deployment steps).

## Architecture

**Modular monolith.** One Hono server (`src/server`), one Next.js app (`src/client`), shared types in `@pavilion/types` (`src/packages/types`). Routers are mounted in [src/server/src/index.ts](src/server/src/index.ts) under `/api/<domain>`.

**Domain boundaries — no cross-domain imports.** See technical-notes.md "Architecture & Domain Boundaries" for the full domain-responsibility table (the single canonical copy — don't duplicate it here).

Each domain under `src/server/src/domains/<name>/` follows `<name>.router.ts` (Hono routes, owns the `auth` middleware and request/response shape) + `<name>.service.ts` (Supabase queries, row↔domain-type mapping, business rules), with tests in `__tests__/`. `user`, `venue`, `session`, `rating`, and `admin` are implemented; `messaging` is still a router-only stub awaiting implementation — follow the same router/service split when filling it in. See misc-tech-notes.md "Database Logic" for the specific not-yet-built pieces within implemented domains, and technical-notes.md "Admin & Roles" for the role hierarchy and per-domain admin-override pattern every other domain follows for its own admin-gated actions.

**Row mapping convention:** services define a private `*Row` type matching the snake_case DB columns, and a `to<Type>()` function that maps it to the camelCase type exported from `@pavilion/types`. Routers never see raw DB rows.

**Auth:** [src/server/src/middleware/auth.ts](src/server/src/middleware/auth.ts) validates the bearer token via Supabase and sets `userId` in Hono context (`c.get('userId')`). Any new authenticated router applies this middleware with `router.use(auth)`.

**Supabase client:** [src/server/src/lib/supabase.ts](src/server/src/lib/supabase.ts) uses the service-role key — it bypasses RLS, so authorization (ownership checks, private-profile visibility, etc.) must be enforced in service-layer code, not assumed from RLS policies.

**Derived values are computed server-side, never stored:** rating tier/subtier from `internal_score` (implemented). See technical-notes.md for the exact formulas — don't re-derive them from scratch or cache them in a column. (Shuttle cost auto-calculation follows the same principle, but it's deferred — see brainstorm.md's Future Features Roadmap, not session-domain v1 scope.)

**Marketplace is a deferred bounded domain** (fully deferred — see brainstorm.md's Future Features Roadmap). Don't add marketplace concepts (shop, inventory, listing, order, commission) to `session`, `venue`, or `user` models, even as optional fields.