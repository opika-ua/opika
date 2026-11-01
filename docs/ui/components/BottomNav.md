# BottomNav

File: `apps/web/src/ui/BottomNav.tsx`

**Purpose.** A short top-level nav as a fixed bottom bar (the kabinet).

**Props and variants.** `label`, `items` ({key, href, label}), `current` (a key), `layout`: bar or bar-then-rail (side column from `desktop`).

**Accessibility.** Named nav; the current item is `aria-current=page`.

**Responsive.** 48px tabs; `pb-inset` clears the home indicator; the page needs bottom padding equal to the bar.

**Example.**

```tsx
<BottomNav label="Кабінет" current="home" items={[…]} />
```
