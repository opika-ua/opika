# Sheet

File: `apps/web/src/ui/Sheet.tsx`

**Purpose.** A bottom sheet with its own trigger.

**Props and variants.** `id`, `label`, `closeLabel`, `trigger`, `triggerClassName?`. Client component, on the shared core.

**Accessibility.** Trigger is `<a href=#id>`: opens with no JS through `:target`. With JS it upgrades to `showModal()`: trap, Esc, Back, scroll lock.

**Responsive.** Full width, `dvh` max height, safe-area padding.

**Example.**

```tsx
<Sheet id="filters" label="Фільтри" closeLabel="Закрити" trigger="Фільтр">…</Sheet>
```
