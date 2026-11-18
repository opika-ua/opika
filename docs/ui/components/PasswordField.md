# PasswordField

File: `apps/web/src/ui/PasswordField.tsx`

**Purpose.** A password input with a show/hide button, on the same field frame as TextField.

**Props and variants.** `id`, `label`, `hint?`, `error?`, `describedBy?`, `autoComplete`
(`current-password` | `new-password`), `showLabel`, `hideLabel`, plus input attributes (`name`,
`value`/`defaultValue`, `onChange`, `onBlur`, `required`). The kit holds no copy: both button names
arrive as props.

**Accessibility.** Label tied by `htmlFor`; hint and error by `aria-describedby`; `aria-invalid` when
`error` is set. The button's name says what pressing it does («Показати пароль» / «Сховати пароль»),
so the state is heard from the name; it is `type="button"` with `aria-controls` on the input, and
showing keeps the value and the focus.

**Responsive.** 48px input and button, 16px text. The button sits under the input on a phone and
beside it from `tablet`.

**Example.**

```tsx
<PasswordField
  id="password"
  name="password"
  label="Пароль"
  autoComplete="new-password"
  showLabel="Показати пароль"
  hideLabel="Сховати пароль"
/>
```
