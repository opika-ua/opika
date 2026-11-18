# InlineList

File: `apps/web/src/ui/InlineList.tsx`

**Purpose.** Items on one line, joined by a drawn separator that never ends a line: «Притулок «Домівка» · 6 карток ?», «2 картки давно не оновлювались · Показати». When the row wraps, no line ends (or starts) with a separator (owner, 2026-11-18).

**Props and variants.** `items`: text or controls, in order. `className` (layout only).

**Accessibility.** Separators are pseudo-elements (`inline-list-item::before`), never in the accessibility tree. The row clips sideways only and leaves room at a line's start, so a control's focus ring is never cut.

**Responsive.** Wraps between items; an item may wrap inside itself (a long name).

**How.** Each separator leads the item after it, in a gutter the row pulls back past its own start; an item that wraps to a new line takes its separator into the clipped margin.

**Example.**

```tsx
<InlineList items={[shelterName, <CardCount key="count" />]} />
```
