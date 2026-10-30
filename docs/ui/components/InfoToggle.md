# InfoToggle

File: `apps/web/src/ui/InfoToggle.tsx`

**Purpose.** A «?» button that reveals a short explanation in the flow (the animals list's note on how the list is ordered).

**Props and variants.** `label` (the button's accessible name), `children` (the explanation), `className?` (layout). Client component.

**Accessibility.** A disclosure: `aria-expanded`, `aria-controls` while open; 48px target; focus-visible; Esc on the button closes it. The «?» glyph is decorative.

**Responsive.** The explanation wraps at a readable measure under the button.

**Example.**

```tsx
<InfoToggle label="Як впорядковано список">Порядок за датою…</InfoToggle>
```
