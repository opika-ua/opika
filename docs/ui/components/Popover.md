# Popover

File: `apps/web/src/ui/Popover.tsx`

**Purpose.** A panel under its trigger (the filter selectors).

**Props and variants.** `trigger`, `label`, `panelLabel?` (the panel group's name; defaults to `label`), `active?`, `variant?` (`chip`: a pill, ink when active; `field`: a 52px field, accent border when active or open), `panel?` (`list`: a column; `pills`: wrapping choice chips, 12px gap, 20px padding, up to 410px wide), `align?` (flips to `end` when `start` would overflow the viewport), `clear?` (`{ href, label }`: when active, a ✕ link in place of the chevron), `className?`. Client component.

**Accessibility.** `aria-expanded`/`aria-controls`; the panel is a fieldset named by `panelLabel`. Opening moves focus to the first usable control (skipping `aria-disabled`); Esc closes and refocuses the trigger, and so does the trigger itself; outside click or Tab away closes without moving focus. Not modal.

**Responsive.** Panel is as wide as the trigger at least; it lines up with the far edge when it would overflow.

**Example.**

```tsx
<Popover variant="field" panel="pills" label="Місто: Київ" panelLabel="Місто" trigger="Київ" active clear={{ href, label: "Скинути Місто" }}>
  <Chip kind="choice" control="button" pressed count={34} accessibleName="Київ, 34 тварини" onPress={toggle}>Київ</Chip>
</Popover>
```
