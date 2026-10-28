# Chip

File: `apps/web/src/ui/Chip.tsx`

**Purpose.** One chip, five kinds.

**Props and variants.** `kind`: option (checkbox or radio input in a label, no-JS form), toggle (`pressed`, a button), link (`href`, `current`), info (`tone`: neutral, outline), status (`tone`: ink, accent, success, warning, danger). Also exports `chipClass`.

**Accessibility.** Option keeps a real input (arrow keys, form submit). Toggle sets `aria-pressed`. Link sets `aria-current=page`. Interactive chips are 48px tall; info and status are not controls.

**Responsive.** Wrap in a flex-wrap row.

**Example.**

```tsx
<Chip kind="option" type="checkbox" name="age" value="baby">Малюки</Chip>
```
