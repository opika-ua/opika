# BottomNav

File: `apps/web/src/ui/BottomNav.tsx`

**Purpose.** A short top-level nav (the kabinet's first level): a fixed bottom bar on a phone, a side column from `desktop`.

**Props and variants.** `label`, `items` ({key, href, label}), `current` (a key), `layout`: bar or bar-then-rail (side column from `desktop`). Text only.

**Accessibility.** Named nav; the current item is `aria-current=page`.

**Responsive.** Text-only bar, every tab 48px, `pb-inset` clears the home indicator; the page needs bottom padding equal to the bar. The current tab is tinted with an orange rule over it; in the rail the current row is tinted with an orange marker on its left edge, and the rail's left edge sits on the page gutter. Marked `BOTTOM_BAR`, so a toast sits above the bar (the rail, `position: static`, is not counted).

**Example.**

```tsx
<BottomNav label="Кабінет" current="home" items={[…]} />
```
