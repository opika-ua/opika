# FieldError

File: `apps/web/src/ui/form.tsx`

**Purpose.** A field's error message, directly under the control and above its hint.

**Props and variants.** `id` (the fields use `<field id>-error`), children: the field's own sentence
(«Вкажіть назву притулку»), never a generic «Заповніть це поле».

**Look.** `danger` text, weight 600 (`text-label`), the `alert` icon before it. The control in error has
the 2px `danger` border and the `danger-bg` fill (`INVALID`, keyed on `aria-invalid`). Tokens:
`docs/ui/tokens.md`, "Form errors".

**Accessibility.** The fields set `aria-invalid="true"` and add this id to `aria-describedby`, so a
screen reader reads the message with the field. The icon is decorative; the words carry the meaning,
never the colour alone.

**Responsive.** The message wraps beside the icon.

**Example.**

```tsx
<TextField id="name" label="Назва притулку чи ініціативи" error="Вкажіть назву притулку" />
```
