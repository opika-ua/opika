# AssistanceLine

File: `apps/web/src/ui/AssistanceLine.tsx`

**Purpose.** The help line under an auth card, outside it: «Потрібна допомога? Напишіть мені»,
«Не вдається увійти? Напишіть мені».

**Props and variants.** `text` (the muted lead-in), `linkLabel`, `href` (from the contact config: a
`mailto:` or Telegram link), `className?` (layout only). The kit holds no copy.

**Look.** Centred; a small decorative `chat` icon, `ink-2` text, the link underlined in `ink`.

**Accessibility.** The icon is `aria-hidden`; the words and the link carry the meaning. The link is 48px
tall with `focus-ring`.

**Responsive.** Wraps and stays centred on narrow phones.

**Example.**

```tsx
<AssistanceLine text="Потрібна допомога?" linkLabel="Напишіть мені" href={contactHref} />
```
