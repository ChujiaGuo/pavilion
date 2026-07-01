# Design System

_Last updated: 2026-07-01_

See `brainstorm.md` for product/feature decisions and `technical-notes.md` for architecture. This file is for front-end visual/thematic and UX decisions only — page-specific copy and layout live in the code itself once built, not here.

---

## Platform

Mobile-first responsive web — see `technical-notes.md`'s "Platform" section for the full rationale and breakpoint priority. Don't duplicate that decision here.

---

## Component Library

- **shadcn/ui + Radix primitives** on top of Tailwind v4 (already a `client` dependency). Chosen because the app's core flows — signup, the multi-step onboarding quiz, RSVP — are form-heavy and benefit from Radix's built-in accessibility (focus management, keyboard nav, ARIA) rather than hand-rolling form/dialog/input components.
- Visual identity (color palette, typography, logo) — not yet decided. Add here once chosen; don't let it drift into component code as an unstated default.

---

## UX Principles

- **Single primary CTA per screen** — no competing actions fighting for attention. Established on the landing page hero; applies to any screen with a clear next action.
- **Lowest friction on high-frequency actions** — account signup is a bare-minimum form (email, password, display name, city); profile-polish fields (preferred format, play style) are deferred to a post-onboarding nudge rather than blocking account creation. Mirrors the one-tap RSVP friction principle in `brainstorm.md`.
- **No fabricated trust signals** — don't show testimonials, user counts, or activity stats before they're real. Omit a section rather than fake it.
- **Copy accuracy over polish** — don't word a feature to imply more automation than exists (e.g., avoid phrasing that suggests the app books the court for you — it doesn't; see `brainstorm.md`'s Booking model). Describe what the coordination layer actually does.

---

## Content vs. Data

Prefer hardcoded front-end content over a database table until there's an operational reason to make it dynamic. Example: the current launch-region list (Central Maryland: Rockville, Gaithersburg, Silver Spring, Columbia) is a static list in the client, not schema-driven — there's no admin/user-facing reason yet for it to live in a table. Revisit only if an actual "notify me" waitlist capture gets built (that would need its own small table, unrelated to `venues`).

---

## Component Architecture Conventions

- **Multi-step/repeatable flows** (e.g. the onboarding placement quiz) should be config-driven: define steps as data (`id`, `prompt`, `type`, `options`) feeding one generic step-renderer component, rather than one bespoke component per step. Keeps adding/reordering/removing a step a data change, not a structural one.
