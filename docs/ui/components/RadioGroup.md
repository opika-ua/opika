# RadioGroup

File: `apps/web/src/ui/groups.tsx`

**Purpose.** A question with one choice: fieldset, legend, hint, error.

**Props and variants.** As CheckboxGroup; `defaultValue` / `value` are a string.

**Accessibility.** As CheckboxGroup; native radios, arrow keys work.

**Responsive.** 48px rows.

**Example.**

```tsx
<RadioGroup name="sex" legend="Стать" options={…} />
```
