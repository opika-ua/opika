# Tabs

File: `apps/web/src/ui/Tabs.tsx`

**Purpose.** Tabs that switch panels in place (ARIA tabs pattern).

**Props and variants.** `label`, `tabs` ({id, label, panel}), `defaultId?`. Client component.

**Accessibility.** One tab stop; Left/Right/Home/End move and select; `aria-selected`, `aria-controls`; inactive panels `hidden`. For page navigation use links, not Tabs.

**Responsive.** Tabs share the row equally; 48px.

**Example.**

```tsx
<Tabs label="Розділи" tabs={[…]} />
```
