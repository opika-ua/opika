# Popover

File: `apps/web/src/ui/Popover.tsx`

**Purpose.** A panel under a chip-styled trigger (the filter selectors).

**Props and variants.** `trigger`, `label`, `active?`, `align?`, `className?`. Client component.

**Accessibility.** `aria-expanded`/`aria-controls`; Esc closes and refocuses the trigger; outside click or Tab away closes. Not modal.

**Responsive.** Panel is as wide as the trigger at least; align `end` near the right edge.

**Example.**

```tsx
<Popover label="Місто: будь-яке" trigger="МІСТО">…</Popover>
```
