# MetaLine

File: `apps/web/src/ui/MetaLine.tsx`

**Purpose.** Facts joined by a drawn separator: «Хлопчик · дорослий · середній».

**Props and variants.** `parts: string[]`; `size`: label (16px, default) or caption (14px, for a narrow card column).

**Accessibility.** Separators are `aria-hidden`.

**Responsive.** Wraps onto more lines.

**Example.**

```tsx
<MetaLine parts={["Хлопчик", "дорослий"]} />
```
