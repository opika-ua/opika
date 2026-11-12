# DateField

File: `apps/web/src/ui/DateField.tsx`; its rules, pure, in `apps/web/src/ui/date-field.ts`

**Purpose.** A calendar date as day, month and year in one fieldset. Every date in the app uses it: there is no native date input (its order follows the browser's language, mm/dd/yyyy in an English Chrome, and it takes a five-digit year), and a guard (`ui-guards.test.ts`, guard 5) keeps it that way.

**Props and variants.** `id` (the day part's; the others are `id-month` and `id-year`), `legend`, `labels` (`day`, `month`, `year`, and `months`: the twelve names, January first, from `monthNamesOf(locale)`), `value`, `today`, `min?`, `hint?`, `error?`, `required?`, `disabled?`, `onChange`. The kit holds no copy: the kabinet passes `DATE_FIELD_LABELS` (`features/kabinet/shared/kabinet-date.ts`).

**Value.** A `DateFieldValue`, a discriminated union: `{ kind: "empty" }`, `{ kind: "date", date }` (an ISO `YYYY-MM-DD`), or `{ kind: "invalid", reason, parts }` with `reason` one of `incomplete`, `no_such_date`, `before_min`, `after_max`, and `parts` what was typed. Stateless: the caller holds the value (so it can reset it) and `onChange` gets the next one, already checked. `dateValue(iso | null)` makes one from a stored date; `sameDateValue` compares two.

**Bounds.** The latest date is `today`, Kyiv's date on the caller's clock (`kyivCalendarDateOf(now)`); the earliest is `min`, per use (the animal form: thirty years back, as `ageDateProblem`; the operator's dates: none). Both edges are accepted. The form still checks a stored date with its own domain rule, since a stored one never passed through the field.

**Parts.** Day and year are text inputs with `inputMode="numeric"`, digits only and capped at 2 and 4 (`type="number"` ignores `maxLength`), so a five-digit year cannot be typed. The month is a native select of the month names in the genitive («листопада»), after an empty choice.

**Accessibility.** One `fieldset` named by its `legend`, a visible label per part. The group is described by the hint and the error; every part is `aria-invalid` and described by the one error message. A link to `#id` (the error summary's) lands on the day. Moving between parts is still one field: the animal form shows the error once focus leaves the group.

**Responsive.** 48px parts, 16px text. Day, month, year in one row; on a narrow phone the year wraps below.

**Example.**

```tsx
<DateField
  id="animal-birth-date"
  legend="Дата народження"
  labels={DATE_FIELD_LABELS}
  value={values.birthDate}
  today={kyivCalendarDateOf(now)}
  min={calendarDateYearsBefore(today, 30)}
  error={problemText(problems, "birthDate")}
  onChange={(birthDate) => set({ birthDate })}
/>
```
