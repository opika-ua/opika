# Heading

File: `apps/web/src/ui/Heading.tsx`

**Purpose.** Headings mapped to the type scale.

**Props and variants.** `level` 1-4 is the outline; `look`: display-xl, display-l, title, section (20px on a phone, the 26px title from tablet), body-l. Headings are weight 700. `tabIndex={-1}` (with an optional `ref`) makes a heading a programmatic focus target (an error summary, a section the page jumps to) without joining the tab order; it then shows the focus ring.

**Accessibility.** One h1 per page; do not skip levels.

**Responsive.** Sizes are fixed steps; the display faces are for h1 and hero text.

**Example.**

```tsx
<Heading level={2}>Про притулок</Heading>
```
