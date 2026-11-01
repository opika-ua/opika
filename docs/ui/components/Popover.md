# Popover

File: `apps/web/src/ui/Popover.tsx`

**Purpose.** A panel under its trigger (the filter selectors). The panel is a manual popover in the top layer, portaled to `document.body`, so no `overflow` container clips it and it needs no z-index. Positioning and close-on-hidden come from the shared `useAnchored` (`ui/anchored.ts`), as in Menu: the panel follows the trigger on scroll and resize, and closes (focus back on the trigger if it was inside) when the trigger goes under the sticky header or off screen.

**Props and variants.** `trigger`, `label`, `panelLabel?` (the panel group's name; defaults to `label`), `active?`, `variant?` (`chip`: a pill, ink when active; `field`: a 52px field, accent border when active or open), `panel?` (`list`: a column; `pills`: wrapping choice chips, 12px gap, 20px padding, up to 410px wide), `align?` (flips to `end` when `start` would overflow the viewport), `clear?` (`{ href, label }`: when active, a ✕ link in place of the chevron), `className?`. Client component.

**Accessibility.** `aria-expanded`/`aria-controls`; the panel is a fieldset named by `panelLabel`. Opening moves focus to the first usable control (skipping `aria-disabled`); Esc closes and refocuses the trigger, and so does the trigger itself; outside click or Tab away closes without moving focus (the panel is at the end of the DOM, so Tab out of it leaves the page's order). Not modal.

**Responsive.** Panel is as wide as the trigger at least; it lines up with the far edge when it would overflow, and never closer than 8px to the viewport edge.

**Example.**

```tsx
<Popover variant="field" panel="pills" label="Місто: Київ" panelLabel="Місто" trigger="Київ" active clear={{ href, label: "Скинути Місто" }}>
  <Chip kind="choice" control="button" pressed count={34} accessibleName="Київ, 34 тварини" onPress={toggle}>Київ</Chip>
</Popover>
```
