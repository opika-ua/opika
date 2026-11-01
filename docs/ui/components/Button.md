# Button

File: `apps/web/src/ui/Button.tsx`

**Purpose.** The one button. Replaces controls.Button, CircleButton, PillButton and the deck's ActionButton.

**Props and variants.** `variant`: primary (ink), accent (orange fill with white text, an accepted contrast deviation, see tokens.md), secondary (outline), ghost, icon (circle with a 1px ink-2 edge, because the surface fill is near-identical to the page and the edge keeps the shape above 3:1; needs `aria-label`). `size`: md (48, label weight 600) or lg (52, 64 from desktop, label weight 700). `status`: idle or loading (aria-busy, presses ignored, stays focusable). `disabled` works as native. `className` for layout only.

**Accessibility.** Real `<button>`, `type=button` by default. Icon variant requires an accessible name by type. Visible focus from `focus-ring`.

**Responsive.** md is 48px high everywhere; lg shrinks to 52px on a phone so a pair fits at 360.

**Example.**

```tsx
<Button variant="accent" size="lg">Дати сімʼю</Button>
```

`buttonLookClass(variant, size)` is the look without the behaviour classes (cursor, focus ring, disabled), for a decorative `aria-hidden` span that only resembles a button, such as the gallery card pill.
