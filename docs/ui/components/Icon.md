# Icon

File: `apps/web/src/ui/Icon.tsx`

**Purpose.** The one inline-SVG icon set.

**Props and variants.** `name`: menu, filter, chevron-down, chevron-right, chevron-left, more (⋯), close, check, plus, phone, send, chat, mail, globe. `size`: sm, md, lg. `label` only when the icon stands alone.

**Accessibility.** Decorative (`aria-hidden`) unless `label` is given.

**Responsive.** Fixed sizes from the spacing scale.

**Example.**

```tsx
<Icon name="filter" />
```
