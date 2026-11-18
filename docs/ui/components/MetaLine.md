# MetaLine

File: `apps/web/src/ui/MetaLine.tsx`

**Purpose.** Facts joined by a drawn separator: «Хлопчик · дорослий · середній».

**Props and variants.** `parts: string[]`; `size`: label (16px, default) or caption (14px, for a narrow card column).

**Accessibility.** Built on [InlineList](InlineList.md): the separators are pseudo-elements, never in the accessibility tree, and none ends or starts a line (owner, 2026-11-18). Each fact stays unbroken. Optional `testId` names the line for tests.

**Responsive.** Wraps between facts onto more lines, with no separator left at a line's end.

**Example.**

```tsx
<MetaLine parts={["Хлопчик", "дорослий"]} />
```
