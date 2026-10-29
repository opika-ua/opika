# Container

File: `apps/web/src/ui/Container.tsx`

**Purpose.** Max width plus page gutters.

**Props and variants.** `as`: div, main, header, footer, nav.

**Accessibility.** Use `main` once per page. `as="main"` carries the shared `id="main-content"` and `tabIndex={-1}` (`ui/landmark.ts`), the skip link's target.

**Responsive.** Gutters 16 / 24 / 56 at phone / tablet / desktop; max 1400.

**Example.**

```tsx
<Container as="main">…</Container>
```
