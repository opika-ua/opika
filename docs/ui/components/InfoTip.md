# InfoTip

File: `apps/web/src/ui/InfoTip.tsx`

**Purpose.** A «?» button that opens a short explanation in a small card (the animals list's note on how the list is ordered). One component for every «?» hint, so the show/hide logic lives in one place.

**Props and variants.** `label` (the button's accessible name), `closeLabel` (the ✕'s name), `children` (plain text or simple inline content), `className?` (layout). Client component.

**Accessibility.** `aria-expanded`, `aria-controls` while open. Opens on click, tap, Enter and Space, never on hover. Closes on ✕, Esc, a press outside, focus leaving, or the «?» again; focus then returns to the «?». Opening moves focus to the ✕. Only one InfoTip is open at a time. 48px «?» target and 44px ✕ target; no animation, so nothing to reduce.

**Responsive.** The card is in the top layer, so opening never moves the content around it. It sits under the «?», start-aligned, up to 280px wide (300px under 600px, never wider than the screen minus 32px), kept 16px inside the viewport with the arrow still on the «?». It opens above when there is no room below, and follows scroll and resize. When the «?» slides under the sticky header or off screen the card closes (like Esc; focus returns to the «?» only if it was in the card). Shared with `ComboboxMulti` through `ui/anchored.ts` (`useAnchored`), which reads the header height from `--sticky-header-h` (globals.css, also the header row's min-height).

**Example.**

```tsx
<InfoTip label="Як впорядковано список" closeLabel="Закрити">Порядок за датою…</InfoTip>
```
