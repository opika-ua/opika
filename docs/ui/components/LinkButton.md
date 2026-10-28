# LinkButton

File: `apps/web/src/ui/Button.tsx`

**Purpose.** A link that looks like a Button, for navigation.

**Props and variants.** Same `variant` and `size` as Button, plus Next `Link` props (`href`, `prefetch`). No `status`.

**Accessibility.** Real `<a>`, works without JS.

**Responsive.** As Button.

**Example.**

```tsx
<LinkButton href="/tvaryny" variant="secondary">До списку</LinkButton>
```
