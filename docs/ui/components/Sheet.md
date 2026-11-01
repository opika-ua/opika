# Sheet

File: `apps/web/src/ui/Sheet.tsx`

**Purpose.** A bottom sheet with its own trigger.

**Props and variants.** `id`, `label`, `closeLabel`, `trigger`, `triggerClassName?`, `hideFrom?` (`tablet` | `desktop`: the sheet and its :target reveal are off from that breakpoint; pair it with the trigger's own hiding class), `triggerTestId?`/`dialogTestId?` (harness hooks). Client component, on the shared core.

**Accessibility.** Trigger is `<a href=#id>`: opens with no JS through `:target`. With JS it upgrades to `showModal()`: trap, Esc, Back, scroll lock.

**Responsive.** Full width, `dvh` max height, safe-area padding.

**Example.**

```tsx
<Sheet id="filters" label="Фільтри" closeLabel="Закрити" trigger="Фільтр">…</Sheet>
```
