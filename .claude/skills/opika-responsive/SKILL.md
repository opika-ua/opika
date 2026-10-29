---
name: opika-responsive
description: Use for layout, mobile, tablet or desktop work in Opika (breakpoints, phone patterns, touch targets, overflow, dvh, safe areas, text sizes, bottom sheets, sticky bars).
---

# Opika responsive

The audience is budget Android at 360 wide as much as iPhone 390. Mobile first.

- **Viewport matrix:** check 360, 390, 412, 768, 1024, 1440, 1920. Breakpoints are `tablet` 600, `desktop`
  1024, `wide` 1440, `ultrawide` 2000 (`docs/ui/tokens.md`). The browser baseline is `browserslist` in
  `apps/web/package.json`; `dvh`, `:has()`, container queries, `inert`, `<dialog>` and `scroll-snap` are fine.
- **Adapt, do not just reflow.** A phone layout has its own proportions: avatar and photo ratios, type,
  density and padding change, not only the column count. Use the phone patterns: bottom `Sheet` for
  filters, `StickyActionBar` for the primary action, full-width `SegmentedControl`, `BottomNav` in the
  kabinet, a menu below `tablet` in the header.
- **Text:** minimum 14px anywhere, 16px body and labels, secondary text `text-ink-2`, labels 600, headings
  700. Use the type-scale utilities, never a hand-picked size (`docs/ui/tokens.md`).
- **Targets and focus:** 48px minimum (`min-h-target`), visible `focus-ring`, enough gap between adjacent
  targets to avoid mis-taps.
- **Overlays:** native `<dialog>` through `Modal`/`Sheet` (focus trap, Esc, Back); heights in `dvh`, bottom
  padding `pb-safe`; fixed bars use `pb-inset`.
- **No horizontal overflow** at any width. `test/harness/dev-ui.harness.ts` loads `/dev/ui` at 360 and 1440
  and fails on overflow; screenshot your own page at 360 and 1440 too.
- Tests do not measure looks (`CLAUDE.md`); the only size test is the 48px floor on the shared primitives.
