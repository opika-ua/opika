# ToastProvider

File: `apps/web/src/ui/Toast.tsx`

**Purpose.** Holds the toast queue and the live region. Wrap the page once; call `useToast().show(message, tone, { action?, durationMs? })` from client components. `durationMs` overrides the default for one toast (the saved page's undo stays 6 s).

**Props and variants.** `dismissLabel`, `durationMs` (default 5000). Client component.

**Accessibility.** Always-present `aria-live=polite` region so announcements work; toasts leave on a timer and on dismiss, and the timer starts again from the full time when the pointer or focus leaves a toast it was on. An action is an undo of something already done, never the only way to do it. Nothing else the person must act on belongs in a toast.

**Responsive.** Fixed at the bottom, `z-(--z-toast)`, above the home indicator.

**Example.**

```tsx
<ToastProvider dismissLabel="Закрити">…</ToastProvider>
```
