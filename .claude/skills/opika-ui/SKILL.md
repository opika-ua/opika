---
name: opika-ui
description: Use for any UI work in Opika (components, screens, styling, buttons, forms, cards, chips, overlays, tokens, fonts, colours, spacing). Kit-first rule, decision tree, tokens, type scale, guard tests, the /dev/ui showcase.
---

# Opika UI: kit first

Sources of truth: `docs/ui/README.md` (rules + catalog), `docs/ui/tokens.md` (every token and the type
scale), `docs/ui/components/<Name>.md` (props, variants, do/don't, a11y). Do not restate them; read them.

## Decision tree

1. A kit component in `apps/web/src/ui` does it: use it.
2. Several kit components do it together: compose them in the feature folder (`features/*`). Composites
   (cards, filter rows, shells) live there, not in the kit.
3. The kit cannot express it and the need is shared: extend the kit. A new or changed component needs
   its `docs/ui/components/<Name>.md`, a catalog row in `docs/ui/README.md`, a `/dev/ui` showcase entry
   (guard 7 fails otherwise) and logic/a11y tests.
4. Never a one-off in a feature folder, never a copy of a kit component.

## Rules (owner, 2026-10-28)

- Unified tokens only: unprefixed names (`bg-surface`, `text-ink`, `rounded-card`). No `rg-`, `brand-`,
  bare Keeper's Voice tokens, `font-rg`, raw hex or arbitrary values (`text-[13px]`).
- Type: use `text-display-*`, `text-title`, `text-body-l`, `text-body`, `text-label`, `text-caption` or
  `Heading`/`Text`. Minimum text is 14px anywhere; body and labels are 16px. Labels weight 600 (the large Button 700),
  headings 700, never 500 for anything that must stand out. Secondary and hint text is `text-ink-2`.
- `className` on kit components is for layout (margin, width) only, never restyling.
- 48px target (`min-h-target`) and `focus-ring` on every control. Variants are discriminated unions.
- The kit holds no copy: labels arrive as props (see skill `opika-copy`).
- Images only through `Photo`. Client components only when state is needed; the "use client" budget
  is a guard.

## Guards (`apps/web/src/guards/ui-guards.test.ts`)

Raw hex, one token set, arbitrary values, raw `<img>`, client-file budget, kit coverage.
The allowlists (`apps/web/src/guards/allowlist-*.ts`) only shrink: never add an entry to get CI green;
fix the code. The arbitrary-value, token and raw-`<img>` tables are empty (DS PR 4) and stay as permanent
tests, so any entry there is a regression; raw hex and client files have a few justified entries.

## Verify

Run the web dev server, open `/dev/ui` (404 in a production build unless `OPIKA_DEV_UI=1`), screenshot at
360 and 1440. Tests assert behaviour, not pixels (`CLAUDE.md`, test logic not looks). For layout and
phone work also load skill `opika-responsive`.
