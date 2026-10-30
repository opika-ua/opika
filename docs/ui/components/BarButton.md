# BarButton

File: `apps/web/src/ui/StickyActionBar.tsx`

**Purpose.** A button for the ink `StickyActionBar`: `text` is white text on the bar («Скасувати»), `pill` a white pill with ink text («Зберегти»).

**Props and variants.** `kind` (`text` | `pill`), the native button props (`onClick`, `aria-disabled`, `disabled`), `children`.

**Accessibility.** 44px drawn, 48px to the pointer (a `before:` overhang as the choice chips); visible focus ring in white (`focus-ring-on-ink`), since the orange ring is below 3:1 on ink.

**Responsive.** Never wraps its label; the bar wraps its message instead.

**Example.**

```tsx
<StickyActionBar tone="ink"><p>Є незбережені зміни</p><BarButton kind="text">Скасувати</BarButton><BarButton kind="pill">Зберегти</BarButton></StickyActionBar>
```
