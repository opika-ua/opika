# CheckboxGroup

File: `apps/web/src/ui/groups.tsx`

**Purpose.** A question with several choices: fieldset, legend, hint, error.

**Props and variants.** `name`, `legend`, `options` ({value, label}), `hint?`, `error?`, `disabled?`; uncontrolled `defaultValue` or controlled `value` + `onChange`.

**Accessibility.** `fieldset` + `legend` name the group; hint and error linked with `aria-describedby`. Submits repeated `name=value` pairs, so a GET filter form works without JS.

**Responsive.** 48px rows.

**Example.**

```tsx
<CheckboxGroup name="age" legend="Вік" options={…} />
```
