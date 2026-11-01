# Pagination

File: `apps/web/src/ui/Pagination.tsx`

**Purpose.** Numbered pages as links.

**Props and variants.** `page`, `totalPages`, `hrefFor(page)`, labels (`navLabel`, `prevLabel`, `nextLabel`, `pageLabel` with `{page}`, `currentLabel`), `ofTotalLabel?`.

**Accessibility.** Named nav; page links named by `pageLabel`; the current page is `aria-current=page` and read with `currentLabel`; nothing renders for one page. Works without JS.

**Responsive.** Hit areas 48px, visible circle 44. Below tablet the gaps drop out and «з N» is hidden so prev, numbers and next fit one row at 360; it wraps only if the window is wider.

**Example.**

```tsx
<Pagination page={2} totalPages={83} hrefFor={…} … />
```
