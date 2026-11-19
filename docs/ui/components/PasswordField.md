# PasswordField

File: `apps/web/src/ui/PasswordField.tsx` (client: the show/hide state)

**Purpose.** The only password input: a field with an eye toggle inside it on the right, on the same
frame as TextField. Used for sign-in, registration, set password (invite), reset and change password.

**Props and variants.** `id`, `label`, `hint?`, `error?`, `describedBy?`, `status?` (a live line under
the hint, such as how many characters are missing), `autoComplete` (`current-password` |
`new-password`, required so each place keeps the right one), `showLabel`, `hideLabel`, plus input
attributes (`name`, `value`/`defaultValue`, `onChange`, `onBlur`, `required`). The kit holds no copy:
the kabinet passes `uk.kabinet.signIn.showPassword` / `hidePassword`.

**Accessibility.** Label tied by `htmlFor`; hint and error by `aria-describedby`; `aria-invalid` and the
danger look when `error` is set. The eye is a `type="button"` (never submits) with `aria-controls` on
the input, `aria-pressed` while shown, and an `aria-label` that says what pressing it does
(«Показати пароль» / «Сховати пароль»). The icon swaps between eye and eye-off. Showing keeps the
value; a pointer press does not take focus, so the input (and the phone keyboard) keeps it.

**Responsive.** 48px input; the eye is a 48px square inside its right end, the input pads 56px on the
right so text never runs under it. 16px text.

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
