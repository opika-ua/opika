# PhotoSlider

File: `apps/web/src/ui/PhotoSlider.tsx`

**Purpose.** Photos that scroll sideways and snap.

**Props and variants.** `photos` ({src, alt}), `sizes`, `label`, `prevLabel`, `nextLabel`. Client component.

**Accessibility.** Named, focusable scroll region (arrow keys scroll); prev/next buttons appear only when there is somewhere to scroll.

**Responsive.** Slides are 80% wide up to 360px so the next one peeks; touch swiping is native.

**Example.**

```tsx
<PhotoSlider photos={…} sizes="(max-width: 599px) 80vw, 360px" label="Фото" … />
```
