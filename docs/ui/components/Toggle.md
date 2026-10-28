# Toggle

File: `apps/web/src/ui/Toggle.tsx`

**Purpose.** A two-option switch made of two real links (the gallery sort).

**Props and variants.** `label`, `options` (a pair of {label, href, ariaLabel?}), `current` 0 or 1.

**Accessibility.** Each option is a link; `ariaLabel` should begin with the visible label (WCAG 2.5.3). The track is decorative: hidden and out of the tab order.

**Responsive.** Never shrinks; place it in a wrapping row.

**Example.**

```tsx
<Toggle label="Сортування" current={0} options={[…, …]} />
```
