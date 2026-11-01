# StickyActionBar

File: `apps/web/src/ui/StickyActionBar.tsx` (client; logic in `sticky-bar.ts`)

**Purpose.** The save / publish bar of a long form. It sticks to the bottom of the screen while the form scrolls and ends in the flow after the last section, so nothing is covered at the end of the page.

**Props and variants.** `children` (a status line and the buttons; the kit holds no copy), `className` (layout only), `tone?` (`surface`, the default: a bordered card; `float`: only the sticky placement, above the phone nav through `bottom-above-nav` and 16px above the bottom from `desktop`; from `tablet` the pill is `position: fixed`, centred on the viewport (`left: 50%`, `-translate-x-1/2`, hugging its content), and the wrapper only reserves its 56px of flow space, for the kabinet's `SavePill` in `features/kabinet/shared`, which draws the pill or bar and is mounted only while there is something to act on.

**Accessibility.** The buttons are ordinary tab stops. On a phone the on-screen keyboard overlays the layout viewport, which sticky and fixed bars are laid out against; the bar reads `window.visualViewport` and lifts itself by the covered height, so Save stays reachable with the keyboard open. It sets `scroll-padding-bottom` on the page for the bar's height while mounted and, when a form field gets focus under the bar, scrolls it clear (a button in the bar never scrolls the page). A pinch zoom is not treated as a keyboard. Without JS it is a plain sticky bar.

**Responsive.** An inset card (16px page gutter), 8px or the home-indicator inset above the bottom edge (`pb-inset`).

**Example.**

```tsx
<StickyActionBar>
  <Text look="hint">Чернетку збережено о 12:00</Text>
  <div className="flex gap-2"><Button variant="secondary">…</Button><Button>…</Button></div>
</StickyActionBar>
```
