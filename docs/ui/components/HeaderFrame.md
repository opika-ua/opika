# HeaderFrame

File: `apps/web/src/ui/HeaderFrame.tsx`

**Purpose.** The shared frame of the site header and the kabinet header: full width, gutter `--spacing-header-gutter` (`clamp(16px, 3vw, 40px)`), inner max width `--container-header` (1600px), centred. The logo therefore sits at the same x on both headers at every viewport.

**Props.** `className` (layout only, e.g. the row's flex and min-height), `children`.

**Do.** Put the header row inside it; keep the sticky/background on the `<header>` element around it. **Don't.** Use it for page content (that is `Container`).

**Responsive.** No breakpoints: the gutter is fluid, no horizontal scroll at 320.

**Example.**

```tsx
<header className="sticky top-0 bg-page">
  <HeaderFrame className="flex items-center">…</HeaderFrame>
</header>
```
