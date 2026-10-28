# Panel

File: `apps/web/src/ui/Panel.tsx`

**Purpose.** A 20px box that groups content inside a page or card.

**Props and variants.** `tone`: surface, sunken, outline. `padding`: md, lg. `as`: div, section, aside; `aria-labelledby` to name a region.

**Accessibility.** A named `section` or `aside` is a landmark; a plain div is not.

**Responsive.** `lg` padding grows from desktop.

**Example.**

```tsx
<Panel tone="sunken">…</Panel>
```
