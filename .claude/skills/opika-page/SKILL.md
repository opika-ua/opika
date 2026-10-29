---
name: opika-page
description: Use when adding or changing a page or route in Opika (app router page.tsx, layout, not-found, error, a new variant of an existing page). Page anatomy, server vs client, data fetching, states, SEO block, harness spec.
---

# Opika: a new page

Read `docs/ui/README.md` first, then the docs of the components you use. Start from a similar page in
`apps/web/src/app` (for example `app/tvaryny`, `app/prytulky/[shelterId]`, `app/pro`) and mirror it.

## Anatomy

- `page.tsx` is a server component. Client islands only for real interactivity (state, pointer, focus
  management), kept as small leaves; every new `"use client"` file goes on the client-file budget
  (`apps/web/src/guards/allowlist-client.ts`, with a one-line reason).
- Layout from the kit: `Container` for width and gutters, `Section` per block named by its heading.
  Exactly one `<h1>` (`Heading`). Feature composites live in `features/<area>/`.
- Strings come from `packages/i18n` (skill `opika-copy`); the page and the kit hold no literals.

## Data

- Server: the RSC client in `apps/web/src/api/server-client.ts`. Browser: `browser-client.ts` (kabinet:
  `kabinet-browser-client.ts`). Filters and sorting live in the URL, so the page works without JS.
- Handlers go through `implement(contract)`; public views are built with `pick` (see
  `docs/standing-constraints.md`). Never invent a field on the page.

## States

Every data page has loading (`Skeleton` shaped like the content, no layout shift), empty (`EmptyState`),
error (`ErrorState`) and rate-limited states, plus the paused-shelter and demo cases where relevant.
A new state with new Ukrainian text needs copy approval first.

## Checklist

1. Responsive: skill `opika-responsive` (360 to 1440, no horizontal overflow, 48px targets).
2. SEO block: skill `opika-seo` (title, description, canonical, noindex rules, JSON-LD, sitemap entry).
3. Accessibility: labels, keyboard order, focus visible, aria-live for async status.
4. Tests: logic and flows; add or extend a Playwright harness spec in `apps/web/test/harness/`, found by
   role, label or text only (no geometry).
5. `pnpm check` (typecheck, lint, test, build:web, harness).

## Not-found and error pages

There is no root `app/not-found.tsx`; each segment owns its own. Existing files:

- `app/tvaryny/[animalId]/not-found.tsx` (animal 404) and `app/prytulky/[shelterId]/not-found.tsx` (shelter 404).
- `app/tvaryny/error.tsx` (gallery error boundary, renders the shared `features/gallery/LoadErrorScreen.tsx`)
  and `app/tvaryny/gortaty/error.tsx` (deck).

**Canonical reference: `app/tvaryny/[animalId]/not-found.tsx`.** It is built only from the kit (`Panel`,
`Heading`, `Text`, `LinkButton`), has no arbitrary values, and takes copy from `uk.detail.notFound`. Copy
its shape for a new variant (check `docs/ui/inventory-2026-10.md` only as a dated snapshot; it predates
the migration).

Rules for a new variant:

- Call `notFound()` from the page (or segment) that cannot resolve; Next then serves the 404 status with
  your `not-found.tsx`. Do not render a "not found" screen from a normal page, it would return 200.
- Export `metadata` with `robots: { index: false, follow: false }` from the file itself (see skill `opika-seo`).
- Unit test: follow `app/tvaryny/animal-surfaces.test.tsx` (render the component, assert the title,
  body and action link by text/role, and that `metadata.robots` is noindex).
- Harness: follow `test/harness/animal-detail.harness.ts` ("an unknown or malformed id 404s on-brand"):
  open the route, assert the status and the title/action by role or text, and `expectReachableByTab` for
  the action. No geometry.
