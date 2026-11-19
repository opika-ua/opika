# AuthCardFooter

File: `apps/web/src/ui/AuthCardFooter.tsx`

**Purpose.** The strip at the bottom inside an auth card (registration, sign-in, forgot password) that
switches to the other auth action: «Уже маєте кабінет? **Увійти**», «Ще немає кабінету?
**Зареєструйте притулок**», «Згадали пароль? **Увійти**».

**Props and variants.** `text` (the muted lead-in), `linkLabel`, `href`, `className?` (layout only).
The kit holds no copy.

**Look.** The card's last child, edge to edge (`Card` has no padding): a 1px `line` top divider, the
`tint` fill, centred text; the lead-in in `ink-2`, the link bold and underlined in `ink`.

**Navigation.** A plain `<a>`, never next/link: a full page load (#509). For a /kabinet target pass
`kabinetEntryHref(...)` from `features/kabinet/KabinetEntryLink`, never a literal path.

**Accessibility.** One paragraph, so the lead-in and the link read as one sentence. The link is 48px
tall with `focus-ring`.

**Responsive.** Wraps on narrow phones; stays centred.

**Example.**

```tsx
<Card tone="outline">
  <form className="p-5">…</form>
  <AuthCardFooter text="Уже маєте кабінет?" linkLabel="Увійти" href={kabinetEntryHref("signIn")} />
</Card>
```
