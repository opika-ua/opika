# SegmentedControl

File: `apps/web/src/ui/form.tsx`

**Purpose.** A choice of a few, built from native radios.

**Props and variants.** `name`, `legend`, `segments` ({value, label, hint?}), `value` (null = none), `onChange`, `hint?`, `error?`.

**Accessibility.** Arrow keys move the choice; announced as 1 of N.

**Responsive.** Segments wrap onto more lines on a narrow screen.

**Example.**

```tsx
<SegmentedControl name="sex" legend="Стать" … />
```
