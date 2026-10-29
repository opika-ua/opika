# Combobox

File: `apps/web/src/ui/Combobox.tsx`

**Purpose.** A select-only search field for a long list served by a search (a city picker). The input is editable, but the value is always one of the listed options; typed text never commits. The kit holds no data source and no copy.

**Props.**
- Field: `id`, `label`, `hint?`, `error?`, `describedBy?`, `name?` (a hidden input carries the option's `value`, never the typed text), `required?`, `disabled?`.
- `value: { value, label, detail? } | null` and `onChange(next | null)`. `detail` is a second line in ink-2 (district and region), for same-named places.
- `search(query, signal) => Promise<{ kind: "options", options } | { kind: "too_short" }>`. The signal is aborted when a newer query supersedes the request.
- `suggestions?` shown on an empty field, after the current value, with no request.
- `minQueryLength?` (2), `debounceMs?` (200), `presentation?` (`auto`: dialog below `tablet`; `inline`: always under the field).
- `messages`: `placeholder`, `tooShort`, `loading`, `empty`, `error`, `retry`, `found(count)`, `clear`, `close`. All text arrives from the caller.

**Behaviour.** Debounced search; the previous request is aborted and a late answer to it is ignored; the same query twice is served from a per-field cache. States: loading (Spinner, `aria-busy`), empty, too short, error with a retry button. Client component; a form using it needs JS.

**Accessibility.** The input has `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` (the `listbox`) and `aria-activedescendant`; options are `role="option"` with `aria-selected` on the committed one and a 48px hit area. Arrow keys move through the options (wrapping; Alt+Down opens without moving), Enter commits the active option and does nothing when none is active, Esc closes the list and then restores the committed label, Tab or blur closes and restores. Home and End stay in the text box. Typing is the type-ahead. A polite live region announces the settled result (`found(count)`, `empty`, `error`).

**Responsive.** From 600px the list is a panel under the field. Below it the field is a button that opens a full-height modal `<dialog>` (focus trap, Esc and the Android Back key via the shared dialog core) with the input pinned at the top, so the keyboard does not cover the results. Text is 16px (no iOS zoom).

**Example.**

```tsx
<Combobox id="city" name="cityId" label={t.city} value={city} onChange={setCity} search={searchCities} messages={t.combobox} />
```

## Multi-select mode

File: `apps/web/src/ui/ComboboxMulti.tsx` (rows: `MultiSelectRows.tsx`). Demo: `/dev/ui`, "Combobox, multi-select mode". The single-value async `Combobox` above is unchanged; this is a sibling in the same family, for a list the caller already holds (no request, no loading state).

**Props.** `id`, `label` (the closed field's text while nothing is chosen, and the list's name), `summary` (the chosen names, joined), `selectedValues` (in the order chosen), `rows(query, pinned)`, `onToggle(value)`, `onClear()`, `messages` (`search`, `clear`, `selectedCount(n)`, `found(n)`, `noMatch`, `noMatchHint?`, `clearField`). The caller owns matching, order and the matched part of the text (each row's `label`/`detail` are `[before, matched, after]`); `pinned` is the set of values chosen when the list opened, so a row ticked now does not jump away under the pointer.

**Behaviour.** Closed it shows the label, or the chosen names (ellipsised) with a count badge from two choices and a ✕. Focus or a click opens a text input over a listbox in the top layer (`popover="manual"`, never clipped by a container), at least 320px wide, below the field and clamped to the viewport. A row is a checkbox, the name, an optional second line, and the count at the right in tabular numbers (48px tall). Toggling applies at once and the list stays open. Typed text is never a value: blur or Esc drops it. Keys: ↓/↑ move over usable rows, Enter toggles, Space toggles on an empty field (and types once there is a query), Esc closes and keeps focus, Backspace on an empty field removes the last chosen value.

**Accessibility.** `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`; a `role="listbox"` with `aria-multiselectable`; options carry `aria-selected`, `aria-disabled` and an accessible name that includes the count. Groups are `role="group"` with a name. The badge is an image with the «Вибрано: N» name; a live region announces the number found.

**Phone.** The same rows are drawn as `MultiSelectChecklist` (buttons with `role="checkbox"`, each a Tab stop) inside the gallery's filter sheet; no combobox there, so the on-screen keyboard only appears when the search field is tapped.
