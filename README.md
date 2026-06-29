# Pavilion

A platform for organizing badminton get-togethers — venue discovery, skill-matched sessions, and peer-based player ratings.

---

## Repository Structure

```
/
├── brainstorm.md        # Product brainstorming notes and feature decisions
├── technical-notes.md   # Architecture decisions, stack rationale, technical specs
├── database-schema.md   # Full database table definitions and indexes
└── src/                 # Application code (Pavilion)
    ├── package.json     # Monorepo root — npm workspaces
    ├── packages/
    │   └── types/       # @pavilion/types — shared TypeScript types used by client and server
    ├── client/          # @pavilion/client — Next.js frontend (TypeScript, Tailwind)
    └── server/          # @pavilion/server — Node/Hono backend (TypeScript)
        └── src/
            └── domains/
                ├── user/        # Auth, profiles, privacy, verification
                ├── venue/       # Venue listings, geospatial search, discovery
                ├── session/     # Session creation, RSVPs, scheduling
                ├── rating/      # Skill rating calculation, history, locks
                ├── messaging/   # Session-scoped group chat (Stream Chat integration)
                └── marketplace/ # Stub only — deferred to future version
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

Client runs on `http://localhost:3000`, server on `http://localhost:4000`, Supabase Studio on `http://localhost:54323`.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (full stack) |
| Frontend | Next.js 15 + Tailwind CSS |
| Backend | Node.js + Hono |
| Database + Auth | Supabase (PostgreSQL) |
| Messaging | Stream Chat |
| Payments | Stripe (future) |
| Hosting | Railway or Render |
