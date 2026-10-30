# Tabs

File: `apps/web/src/ui/Tabs.tsx`

**Purpose.** Tabs that switch panels in place (ARIA tabs pattern).

**Props and variants.** `label`, `tabs` ({id, label, panel}), `defaultId?`, `selectedId?` + `onSelect?` (controlled: the page keeps the selection, e.g. in `?tab=`), `look?` (`segmented`, the default: one track of equal tabs; `pills`: separate outlined pills that scroll sideways on a phone). Client component.

**Accessibility.** One tab stop; Left/Right/Home/End move and select; `aria-selected`, `aria-controls`; inactive panels `hidden`. For page navigation use links, not Tabs.

**Responsive.** Tabs share the row equally; 48px. Every tab has `cursor: pointer`; an unselected `pills` tab darkens its border on hover. The focus ring is drawn inside the tab (`focus-ring-inset`), so a row that scrolls sideways and clips vertically never cuts it off. The underline tab row for filtering one list is `FilterTabs` (`ui/FilterTabs.tsx`): 44px of tab plus a 2px rule, the underline 8px under the label, a light underline on hover, ink when selected.

**Example.**

```tsx
<Tabs label="Розділи" tabs={[…]} />
```
