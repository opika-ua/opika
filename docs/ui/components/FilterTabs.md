# FilterTabs

File: `apps/web/src/ui/FilterTabs.tsx`

**Purpose.** One row of underline tabs that filter a single list, each with a count (the kabinet's animals list). Unlike `Tabs`, there is one panel, owned by the page.

**Props and variants.** `label` (the tablist's name), `idPrefix`, `tabs` ({id, label, count, accessibleName}), `value`, `onChange`, `panelId`. Client component. `filterTabId(prefix, id)` gives the tab's id for the panel's `aria-labelledby`.

**Accessibility.** ARIA tabs, automatic activation; one tab stop; Left/Right/Home/End move and select; `aria-selected`, `aria-controls`; the count is part of the accessible name; focus-visible.

**Responsive.** Scrolls sideways on a phone; tabs stay 48px tall.

**Example.**

```tsx
<FilterTabs label="Показати" idPrefix="list" panelId="list-panel" value="all" onChange={setFilter} tabs={[…]} />
```
