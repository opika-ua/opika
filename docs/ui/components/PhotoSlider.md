# PhotoSlider

File: `apps/web/src/ui/PhotoSlider.tsx`

**Purpose.** Photos that scroll sideways and snap.

**Props and variants.** `photos` ({src, alt}), `sizes`, `label`, `prevLabel`, `nextLabel`, `aspect` (`portrait` 4:5 default, `tall` 3:4), `slide` (`peek` default, `full`: one slide fills the row up to 360px, `hero`). Client component.

`hero` (the pet card) is a discriminated variant with its own required props: `counterTemplate` (`{n}`, `{total}`), `rowPrevLabel`, `rowNextLabel` and `rowCounterTemplate` (`{first}`, `{last}`, `{total}`).

- Below desktop: one photo per slide, edge to edge, square-cornered, dots and an «N/M» counter (its name from `counterTemplate`, announced politely). The arrows are named `prevLabel`/`nextLabel` and stay out of sight until focused, since touch swipes.
- From desktop: up to three whole photos side by side, 24px apart (one or two fill the row when that is all there is); never a partly visible photo. With four or more, the `scrim` arrows (40px dark circles, 48px targets) sit on the edge photos and move one photo per press with no wrap-around: «‹» is gone at the start and «›» at the end, and an arrow that hides hands its focus to the other one. The counter («2–4 з 5», `aria-live="polite"`) sits on the last photo in view. A press during the glide goes on from where the row is heading; a swipe or trackpad scroll moves the counter too.

**Loading.** Only the first photo loads up front. Later slides are empty boxes (same aspect, no shift) until an `IntersectionObserver` on the scroller (`rootMargin` 50% each side) arms them; armed stays armed. Without `IntersectionObserver` all load at once.

**Accessibility.** Named, focusable scroll region (arrow keys scroll); prev/next buttons appear only when there is somewhere to scroll. Under reduced motion the buttons and the CSS glide jump instead of scrolling smoothly.

**Responsive.** `peek` slides are 80% wide up to 360px so the next one peeks; touch swiping is native in every variant, the `hero` row included.

**Example.**

```tsx
<PhotoSlider photos={…} sizes="(max-width: 599px) 80vw, 360px" label="Фото" … />
```
