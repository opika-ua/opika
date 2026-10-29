# Chip

File: `apps/web/src/ui/Chip.tsx`

**Purpose.** One chip, six kinds.

**Props and variants.** `kind`: option (checkbox or radio input in a label, no-JS form), toggle (`pressed`, a button), link (`href`, `current`), choice (an option pill with an optional `count`: `control` button with `pressed`/`onPress`, or checkbox/radio with `name`/`value`/`defaultChecked`; `disabled`; `accessibleName` when the visible text abbreviates the name), info (`tone`: neutral, outline), status (`tone`: ink, accent, success, warning, danger). Also exports `chipClass` and `choiceClass` (a choice pill's look for a link beside the pills).

**Accessibility.** Option keeps a real input (arrow keys, form submit). Toggle sets `aria-pressed`. Link sets `aria-current=page`. Interactive chips are 48px tall; a choice pill is 44px to the eye with a 48px hit area (a `before:` overhang). A disabled choice button keeps focus and says `aria-disabled`; a disabled choice input is natively `disabled`, so a form never submits it. The count is `ink-2` (on-ink when selected). Info and status are not controls.

**Responsive.** Wrap in a flex-wrap row.

**Example.**

```tsx
<Chip kind="option" type="checkbox" name="age" value="baby">Малюки</Chip>
<Chip kind="choice" control="button" pressed={false} count={34} accessibleName="Київ, 34 тварини" onPress={toggle}>Київ</Chip>
```
