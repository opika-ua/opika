# TextLink

File: `apps/web/src/ui/TextLink.tsx`

**Purpose.** An inline link inside prose.

**Props and variants.** Next `Link` props. Always underlined. `placement`: `inline` (default, in prose) or `standalone` (a link on its own line, e.g. a back link; 48px tall).

**Accessibility.** Colour is never the only cue. Visible focus.

**Responsive.** Sits in running text; the line box is the target.

**Example.**

```tsx
<TextLink href="/pro">про нас</TextLink>
```
