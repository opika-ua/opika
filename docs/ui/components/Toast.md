# Toast

File: `apps/web/src/ui/Toast.tsx`

**Purpose.** One toast, presentational. `ToastProvider` renders these; it is exported for the showcase and tests.

**Props and variants.** `tone`: info, success, error. `message`, `dismissLabel`, `onDismiss?` (without it there is no dismiss button), `action?` (`{ label, onAction }`: a text button, for an undo), `onHold?` (called with true/false while the pointer or focus is on the toast; the provider holds its timer then).

**Accessibility.** `role=alert` for error. Dismiss button is named by `dismissLabel` and is 48px; so is the action. The action never takes focus on its own; whoever runs it moves focus afterwards (the button is gone).

**Responsive.** Max width 28rem, centred above the safe area.

**Example.**

```tsx
<Toast tone="success" message="Збережено" dismissLabel="Закрити" />
```
