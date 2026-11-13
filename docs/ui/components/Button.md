# Button

File: `apps/web/src/ui/Button.tsx`

**Purpose.** The one button. Replaces controls.Button, CircleButton, PillButton and the deck's ActionButton.

**Props and variants.** `variant`: primary (ink), accent (`accent-strong` fill #D9531A with a pure white (#FFFFFF, `on-accent-strong`) 19px bold `text-cta` label at every size; 4.0:1, passes as large text, see tokens.md), secondary (outline), ghost, link (an action inside a line of text that reads as a link: ink, underlined at rest, a 48px target with 4px side padding; a text line keeps its height with `-my-3` on it; still a real `<button>`, used by the kabinet card's confirm while the date is fresh), icon (circle with a 1px ink-2 edge, because the surface fill is near-identical to the page and the edge keeps the shape above 3:1; needs `aria-label`), scrim (a control on a photo: a 40px dark translucent circle inside the 48px target, the fill clipped to the content box; needs `aria-label`; used by PhotoSlider's desktop arrows). `size`: md (48, label weight 600; accent is always `text-cta`), compact (md with 12px side padding instead of 24, for a pill that shares a tight row with icon buttons, such as the kabinet card's filled confirm beside the pencil and ⋯; its label may wrap to two lines inside the 48px pill) or lg (52, 64 from desktop, label weight 700). `status`: idle or loading (aria-busy, presses ignored, stays focusable). `disabled` works as native. `className` for layout only.

**Accessibility.** Real `<button>`, `type=button` by default. Icon variant requires an accessible name by type. Visible focus from `focus-ring`.

**Responsive.** md is 48px high everywhere; lg shrinks to 52px on a phone so a pair fits at 360.

**Example.**

```tsx
<Button variant="accent" size="lg">Дати сімʼю</Button>
```

`buttonLookClass(variant, size)` is the look without the behaviour classes (cursor, focus ring, disabled), for a decorative `aria-hidden` span that only resembles a button, such as the gallery card pill.
