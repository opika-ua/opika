# MultiSelectChecklist

File: `apps/web/src/ui/MultiSelectRows.tsx`

**Purpose.** The same rows as [MultiSelectListbox](MultiSelectListbox.md) for touch: a list of buttons with `role="checkbox"`, each a Tab stop, no combobox. Used by the gallery's filter sheet drill-down screens (Область, Місто), where a search field above filters the rows.

**Props.** As `MultiSelectListbox`, without `activeValue`.

**Accessibility.** `role="checkbox"` with `aria-checked`; a zero-count row is `disabled` (not focusable). Each row is at least 48px tall.

**Responsive.** Fills its container; scroll the container, not the rows.
