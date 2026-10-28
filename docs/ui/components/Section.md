# Section

File: `apps/web/src/ui/Container.tsx`

**Purpose.** A vertical block of a page, named by its heading.

**Props and variants.** `labelledBy`: the heading's id.

**Accessibility.** Becomes a named landmark when `labelledBy` is set.

**Responsive.** Vertical rhythm only.

**Example.**

```tsx
<Section labelledBy="h">…</Section>
```
