# Toast

File: `apps/web/src/ui/Toast.tsx`

**Purpose.** One toast, presentational. `ToastProvider` renders these; it is exported for the showcase and tests.

**Props and variants.** `tone`: info, success, error. `message`, `dismissLabel`, `onDismiss?` (without it there is no dismiss button).

**Accessibility.** `role=alert` for error. Dismiss button is named by `dismissLabel` and is 48px.

**Responsive.** Max width 28rem, centred above the safe area.

**Example.**

```tsx
<Toast tone="success" message="Збережено" dismissLabel="Закрити" />
```
