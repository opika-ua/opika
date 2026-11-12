# ActionPill

File: `apps/web/src/ui/ActionPill.tsx`

**Purpose.** A few icon-only actions in one small floating pill over a photo, split by a thin rule: the photo manager's crop and «×». Nothing else on the photo is a control.

**Props and variants.** `actions`: an array, one button each, in order. An action is `{ id, icon, label, buttonId?, onIntent? }` plus its `kind`: `ready` with `onClick`, or `blocked` with `reasonId` (the id of the sentence that says why it can't be used now). `onIntent` runs on pointer-over and on focus, to warm up what the action opens (a lazy dialog's chunk). `className` for layout only (where it sits, for example `absolute right-2 bottom-2`). No state: not a client component.

**Accessibility.** Real `<button>`s named by `label` (the icon is decorative), in tab order. A `blocked` action stays focusable with `aria-disabled` and `aria-describedby` its reason, and does nothing when pressed. `focus-ring` on each button. The pill is 40px tall to the eye and each button 44px wide, but each button is 48px tall, centred on the pill and overflowing it by 4px top and bottom: the 48px target without changing the look (the `dev-ui` harness checks it).

**Responsive.** The same at every width: `surface` at 94%, the `float` shadow, 20px icons.

**Example.**

```tsx
<ActionPill
  className="absolute right-2 bottom-2"
  actions={[
    { id: "crop", kind: "ready", icon: "crop", label: "Обрізати фото 2", onClick: openCrop },
    { id: "remove", kind: "ready", icon: "close", label: "Прибрати фото 2", onClick: remove },
  ]}
/>
```
