# FreshnessPips

File: `apps/web/src/ui/FreshnessPips.tsx`

**Purpose.** How recently a listing was confirmed: three pips and the day count in words, always both. Never red or amber, never opacity.

**Props and variants.** `kind`: fresh, aging, stale (the domain's `FreshnessKind`). `label` (required): the day count in words, from the caller's catalogue, so a pip never stands alone. `className` (layout only).

**Accessibility.** The pips are `aria-hidden`; the words carry the meaning.

**Responsive.** One line; pips are 12px, the words are 16px body.

**Source of truth.** `packages/ui`'s `freshnessPips` decides which pips are filled; `FreshnessPips.test.tsx` fails if this marker disagrees. The deck's `SwipeCard` still draws its own on the old tokens until the deck moves onto the kit (DS 3e), which switches it to this one and deletes the old.

**Example.**

```tsx
<FreshnessPips kind="aging" label="Оновлено 12 днів тому" />
```
