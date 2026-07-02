# Design System

_Last updated: 2026-07-02_

See `brainstorm.md` for product/feature decisions and `technical-notes.md` for architecture. This file is for front-end visual/thematic and UX decisions only — page-specific copy and layout live in the code itself once built, not here.

---

## Platform

Mobile-first responsive web — see `technical-notes.md`'s "Platform" section for the full rationale and breakpoint priority. Don't duplicate that decision here.

---

## Component Library

- **shadcn/ui on top of Tailwind v4** — installed when the signup/login pages (the first form-heavy flow) were built. Current shadcn registry generates components on **Base UI** (`@base-ui/react`, the Radix/Floating UI/MUI-team successor to Radix Primitives), not Radix directly — same accessibility rationale (focus management, keyboard nav, ARIA) applies, just a different underlying package. `button.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx` (added for the onboarding quiz's single-choice steps) are in `src/client/src/components/ui/`. Add further primitives with `npx shadcn@latest add <name>` as new flows need them.
- Tailwind v4 requires `@tailwindcss/postcss` in `client`'s devDependencies plus a `postcss.config.mjs` — without both, Tailwind classes silently no-op (the original placeholder page had Tailwind classes that were never actually being applied). Now installed and configured.
- Logo — not yet decided.
- **`GoogleSignInButton`** (`src/client/src/components/auth/google-sign-in-button.tsx`) is a deliberate exception to this app's own brand system — Google's Identity branding guidelines mandate its own colors (`#747775` border, `#1f1f1f` text, white background), unmodified multicolor "G" logo, own font stack (`Google Sans`/Roboto, not Nunito), and one of a fixed set of approved copy strings ("Sign in with Google" / "Sign up with Google" / "Continue with Google"). Don't restyle it to match the app's primary green / Nunito system — that would violate the guidelines.

---

## Color Palette

- **Primary — `#2A6F41` (deep forest green):** CTA buttons, links, active states. Same hue family as the secondary mint but dark/saturated enough to give real contrast against white — needed for the single-primary-CTA principle below to actually read as clickable.
- **Secondary/background accent — `#ADEBB3` (mint green):** one of the stops in the page's background gradient (see Layout Philosophy below), plus low-opacity background typography (`text-primary/10`). Too light and low-contrast on its own to work as a button fill (fails against both dark and white text), so it stays a background/accent color rather than the primary.
- Neutral text/background (grays, off-white) not yet decided — use shadcn defaults until specified here.

---

## Typography

- **Nunito** (via `next/font/google`), applied globally on `<body>` in `layout.tsx`. Rounded terminals give the friendly, casual-sport feel the app is going for, and it stays readable at body-copy sizes (unlike more decorative rounded fonts that only work as display type).

---

## Layout Philosophy — Editorial, Not Boxed

Superseded the earlier card/shadow/per-section-background approach below after it read as generic "AI-generated" template stacking. Current direction:

- **No bounding boxes.** Don't wrap groups of content in cards, borders, or `shadow-*` containers. Separate ideas with whitespace, type scale, and alignment instead of physical containment. (`How it works`'s three items are typographic rows — a giant faint index numeral + heading + copy — not a 3-card grid.)
- **One continuous canvas, not stacked colored sections.** `<main>` carries a single multi-stop background gradient (mint → white → gray → mint → white) that the whole page scrolls through; individual `<section>`s stay transparent so nothing reads as a discrete block. The one exception is the closing CTA, which bleeds from transparent into solid dark green via its own gradient so the canvas organically deepens rather than hard-cutting to a colored box.
- **Background typography for texture.** Oversized, low-opacity (`text-primary/10`, `text-white/5`) numerals or words, wrapped in `aria-hidden` containers, sit behind real copy (e.g. "RALLY" behind the hero, "10" behind the rating section). Nothing — decorative or real — is allowed to touch a viewport or section edge: the shared `decor` wrapper (`page.tsx`) constrains these to the center 75% of the section with a vertical inset from top/bottom, clipping via `overflow-hidden` rather than bleeding off-canvas.
- **Real content lives in a center 2/3 column on desktop** (the shared `content` wrapper, `lg:w-2/3 lg:mx-auto`), so wide viewports don't stretch text into an awkward edge-to-edge spread. Below `lg`, content uses the full width with `px-6`/`sm:px-12` padding.
- **Asymmetry over centered/grid-locked layouts.** Hero headline anchors left across 8 of 12 columns; subhead+CTA sit offset lower-right in the remaining 4. `How it works` rows alternate `justify-end`/left on odd/even index. Launch-region cities are a right-aligned flowing line against a left-aligned label, not centered chips.
- **Fluid, uneven spacing.** Section padding ranges roughly `py-20` to `py-48`; tight-tracked uppercase eyebrow labels (`text-sm tracking-[0.2em]`) sit next to `text-7xl` headlines — deliberate contrast, not a uniform scale.
- shadcn/ui is now installed (see Component Library above). Its current default component styling (v4.12 registry) already has no shadows and only a plain 1px border on form controls, so it matched this direction out of the box on the signup/login pages — no re-skinning was needed. Revisit if a future `add` pulls in a component with heavier default chrome (e.g. `card`, `dialog`).

---

## UX Principles

- **Single primary CTA per screen** — no competing actions fighting for attention. Established on the landing page hero; applies to any screen with a clear next action.
- **Lowest friction on high-frequency actions** — account signup's *required* fields stay bare-minimum (email, password, display name, city); profile-polish fields (preferred format, play style) are deferred to a post-onboarding nudge rather than blocking account creation. First/last name are also on the signup form but optional, not required — they're nullable until a user is verification-tier verified (see technical-notes.md "Auth"), so offering them upfront doesn't add friction. Mirrors the one-tap RSVP friction principle in `brainstorm.md`.
- **No fabricated trust signals** — don't show testimonials, user counts, or activity stats before they're real. Omit a section rather than fake it.
- **Copy accuracy over polish** — don't word a feature to imply more automation than exists (e.g., avoid phrasing that suggests the app books the court for you — it doesn't; see `brainstorm.md`'s Booking model). Describe what the coordination layer actually does.
- **Required-field marker — themed icon, not a generic asterisk/dot.** A small red badminton shuttlecock icon (`RequiredMarker`, `src/client/src/components/ui/required-marker.tsx`) marks required inputs, next to a "[icon] indicates a required field" disclaimer, on any form that mixes required and optional fields (introduced on signup, where first/last name are optional alongside the required set). Skip it on forms where every field is required (e.g. login) — marking everything is redundant. Source SVG at `src/client/src/assets/birdie.svg` (SVG Repo), recolored from its original black fill to the app's `text-destructive` red via `currentColor`, mirrored horizontally from the original.

---

## Content vs. Data

Prefer hardcoded front-end content over a database table until there's an operational reason to make it dynamic. Example: the landing page's launch-region copy (currently just "Maryland" — see `brainstorm.md`'s Go-to-Market Thoughts for the actual target-city list, which stays more specific than the public-facing copy) is a static string in the client, not schema-driven — there's no admin/user-facing reason yet for it to live in a table. Revisit only if an actual "notify me" waitlist capture gets built (that would need its own small table, unrelated to `venues`).

---

## Component Architecture Conventions

- **Multi-step/repeatable flows should be config-driven:** define steps as data (`id`, `prompt`, `type`, `options`) feeding one generic step-renderer component, rather than one bespoke component per step. Keeps adding/reordering/removing a step a data change, not a structural one. Implemented this way for the onboarding placement quiz (`src/client/src/app/onboarding/quiz/quiz-config.ts` + `page.tsx`) — follow the same shape for the next multi-step flow.
