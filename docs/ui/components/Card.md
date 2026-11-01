# Card

File: `apps/web/src/ui/Card.tsx`

**Purpose.** The 24px rounded container.

**Props and variants.** `tone`: surface, page, outline. `as`: div, article, section, li. `id` and `aria-labelledby` for a named region (a `FormSection`).

**Accessibility.** Use `article` or `li` when it is an item of a list.

**Responsive.** Width and aspect ratio via `className`.

**Example.**

```tsx
<Card as="article">…</Card>
```
