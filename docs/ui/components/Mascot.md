# Mascot

File: `apps/web/src/ui/Mascot.tsx` (shapes in `mascot-shapes.ts`, the species picker in `mascot-species.ts`)

**Purpose.** The brand's cat and dog as decorative accents on empty, closing and dead-end states. Inline SVG,
shapes only (cleaned from the Figma Maskot export, each under 1 KB), colours from tokens (`accent`,
`species-dog`, `on-ink`, plus `mascot-dog`, `mascot-dog-light`, `mascot-cat-stripe`, `mascot-tag`). The cat's
eyes on lying and standing poses are even-odd cut-outs and show the background.

**Props.** `kind` `cat | dog`, `pose` `sit | lie | stand`, `variant` (`collar` for the sitting cat, `tail` for
the standing cat), `size` a height of `32 | 48 | 64 | 96` (a phone uses the next step down), `perch`
`top-left | top-right` with `offset` `0 | 4 | 8 | 16 | 24 | 32`, `className` for margin only.
`perch` puts the bottom of the mascot on the top edge of the nearest positioned ancestor: that element needs
`relative` and enough room above it. `mascotKindFor(speciesSelection)` returns the dog for a dogs-only view and
the cat for cats-only and mixed views. `MascotPerch` seats two or more mascots on one edge.

**Where (owner-approved, 2026-10-31).** Gallery hero title (cards present), no-match block, shelter page with
no animals, the not-found and error pages (inline above the heading), the contact reveal dialog (cat and dog on
its top edge, through `Modal`'s `perched`), the closing line of the last gallery page (only when paginated),
Про проєкт (once, on a divider).

**Rules.** At most one mascot moment per screen. Never on cards, controls, inputs, filters, the save bar or
over photos. No motion, no recolouring on dark surfaces. Never carries meaning: no text, no alt.

**Accessibility.** `aria-hidden`, `focusable=false`, `pointer-events: none`: never in the tab order, never takes a click.

**Responsive.** One height step smaller below `tablet`; keep a perched mascot inside the 16px gutter.

**Example.**

```tsx
<div className="relative">
  <Mascot kind="cat" pose="lie" size={48} perch="top-left" offset={32} />
  <h1>…</h1>
</div>
```
