# Photo

File: `apps/web/src/ui/Photo.tsx`

**Purpose.** The only image component.

**Props and variants.** `src` (storage key or path, null for none), `alt`, `sizes` (required), `aspect`: card, cardStacked (4:5, then the card frame from tablet), square, wide, portrait, tall (3:4), `priority` for the one LCP image.

**Accessibility.** Empty `alt` marks it decorative.

**Responsive.** Fixed aspect ratio: no layout shift. Variants come from the R2 loader, never Vercel's optimiser.

**Example.**

```tsx
<Photo src={key} alt="" sizes="(max-width: 599px) 100vw, 328px" aspect="card" />
```
