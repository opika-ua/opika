# ToastProvider

File: `apps/web/src/ui/Toast.tsx`

**Purpose.** Holds the toast queue and the live region. Wrap the page once; call `useToast().show(message, tone, { action?, durationMs?, onClose? })` from client components. `durationMs` overrides the default for one toast (the saved page's undo stays 6 s). `onClose(reason)` runs once when that toast leaves: `action` (its action ran), `dismissed` (its ✕, or the handle) or `expired` (its time ran out; held time does not count); never when the provider itself unmounts. `show` returns a handle whose `dismiss()` takes that toast away early. A deferred write uses both: it commits on anything but `action`, and dismisses the toast when it has to go early (the photo manager's remove).

**Props and variants.** `dismissLabel`, `durationMs` (default 5000). No placement prop: where the toasts sit is one rule for every screen (below). Client component.

**Accessibility.** Always-present `aria-live=polite` region so announcements work; toasts leave on a timer and on dismiss, and the timer starts again from the full time when the pointer or focus leaves a toast it was on. An action is an undo of something already done, never the only way to do it. Nothing else the person must act on belongs in a toast.

**Responsive.** Fixed at the bottom, `z-(--z-toast)`, above the home indicator, and always above every fixed bottom bar: each such bar carries the kit's `BOTTOM_BAR` marker (`sticky-bar.ts`: `BottomNav`, `StickyActionBar`, the animal page's phone action bar), and while a toast shows the provider measures the marked bars that are on screen (fixed or sticky, not hidden) and lifts the toasts to the top edge of the highest one their box would touch (`liftAboveBars`), again on scroll, resize and a change of size. The bars' controls stay clickable under no toast. A new fixed bottom bar spreads `{...BOTTOM_BAR}` on its root; nothing else is needed.

**Example.**

```tsx
<ToastProvider dismissLabel="Закрити">…</ToastProvider>
```
