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
