# MetaLine

File: `apps/web/src/ui/MetaLine.tsx`

**Purpose.** Facts joined by a drawn separator: «Хлопчик · дорослий · середній».

**Props and variants.** `parts: string[]`; `size`: label (16px, default) or caption (14px, for a narrow card column).

**Accessibility.** Separators are CSS pseudo-elements (`meta-part::after`), never in the accessibility tree. Optional `testId` names the line for tests.

**Responsive.** Wraps onto more lines.

**Example.**

```tsx
<MetaLine parts={["Хлопчик", "дорослий"]} />
```
