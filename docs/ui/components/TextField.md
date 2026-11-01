# TextField

File: `apps/web/src/ui/form.tsx`

**Purpose.** Label, input, hint and error as one unit.

**Props and variants.** `id`, `label`, `hint?`, `error?`, `describedBy?`, plus input attributes.

**Accessibility.** Label tied by `htmlFor`; hint and error by `aria-describedby`; `aria-invalid` when `error` is set.

**Responsive.** 48px, 16px text (no iOS zoom).

**Example.**

```tsx
<TextField id="n" label="Імʼя" />
```
