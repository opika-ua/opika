# ToastProvider

File: `apps/web/src/ui/Toast.tsx`

**Purpose.** Holds the toast queue and the live region. Wrap the page once; call `useToast().show(message, tone)` from client components.

**Props and variants.** `dismissLabel`, `durationMs` (default 5000). Client component.

**Accessibility.** Always-present `aria-live=polite` region so announcements work; toasts leave on a timer and on dismiss. Nothing the person must act on belongs in a toast.

**Responsive.** Fixed at the bottom, `z-(--z-toast)`, above the home indicator.

**Example.**

```tsx
<ToastProvider dismissLabel="Закрити">…</ToastProvider>
```
