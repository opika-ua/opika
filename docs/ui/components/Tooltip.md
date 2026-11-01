# Tooltip

File: `apps/web/src/ui/Tooltip.tsx`

**Purpose.** The name of an icon-only control in a small dark bubble, on mouse hover and on keyboard focus. The bubble is a manual popover in the top layer (portaled to `document.body`), so no container clips it and showing it moves nothing; positioning and close-on-hidden come from the shared `useAnchored` (`ui/anchored.ts`), as in InfoTip, Popover and Menu. It lines up with the control's right edge and never sits closer than 8px to the viewport edge.

**Props and variants.** `text`, `children` (the control), `className?` (layout only: where the wrapper sits, for example `absolute top-2 right-2`). Client component.

**Accessibility.** The control keeps its own accessible name (give it the same `text`); the bubble is `role="tooltip"` and is not linked to the control, so it is not read twice. Opens on mouse or pen hover and on keyboard focus (not on a mouse press, not on touch); Esc, leaving, a press, or the control leaving the view closes it. The bubble is never the only way to learn what the control does.

**Responsive.** One line, up to 16rem wide, text 14px.

**Example.**

```tsx
<Tooltip text="Прибрати зі збережених" className="absolute top-2 right-2">
  <button type="button" aria-label="Прибрати зі збережених">…</button>
</Tooltip>
```
