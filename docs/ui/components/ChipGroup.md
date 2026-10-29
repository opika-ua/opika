# ChipGroup

File: `apps/web/src/ui/groups.tsx`

**Purpose.** A question with many short answers (ten temperaments, twelve colours) as wrapping chips instead of a screen of 48px rows: fieldset, legend, hint, error.

**Props and variants.** `name`, `legend`, `hint?`, `error?`, `disabled?`, `extra?` (what an "other" chip opens, kept inside the group), `children` (the chips: `Chip kind="option"`, `type="checkbox"` or `"radio"`).

**Accessibility.** `fieldset` + `legend` name the group; hint and error linked with `aria-describedby`; `disabled` disables every chip. Each chip is a native input, so arrow keys and a screen reader's "1 of N" come from the platform.

**Responsive.** Chips wrap; each is a 48px target.

**Example.**

```tsx
<ChipGroup name="colour" legend="Масть" extra={other ? <TextField … /> : null}>
  <Chip kind="option" type="radio" name="colour" value="black">Чорний</Chip>
</ChipGroup>
```
