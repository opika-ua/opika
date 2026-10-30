# MultiSelectListbox

File: `apps/web/src/ui/MultiSelectRows.tsx`

**Purpose.** The rows of a multi-select list under a combobox field: a `role="listbox"` with `aria-multiselectable`, options with a checkbox, the name (matched part in bold), an optional second line and the count at the right. Used by [ComboboxMulti](ComboboxMulti.md); focus stays in the combobox input.

**Props.** `rows` (prepared by the caller: `value`, `label` and `detail` as `[before, matched, after]`, `count`, `checked`, `disabled`, `name`, `group`), `idPrefix`, `activeValue`, `onToggle`, `label`.

**Accessibility.** Options carry `aria-selected`, `aria-disabled` and a name that includes the count; groups are named `role="group"`. Each row is at least 48px tall.

**Responsive.** Fills its container; the container sets the width.
