# Skeleton

File: `apps/web/src/ui/Skeleton.tsx`

**Purpose.** Loading placeholder shaped like the content.

**Props and variants.** `shape`: line, block, circle; size it with `className` (layout).

**Accessibility.** `aria-hidden`; mark the loading container `aria-busy`. Pulse stops under reduced motion.

**Responsive.** Match the final content's box so nothing shifts.

**Example.**

```tsx
<Skeleton shape="block" className="aspect-3/2" />
```
