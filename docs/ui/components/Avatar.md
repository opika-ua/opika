# Avatar

File: `apps/web/src/ui/Avatar.tsx`

**Purpose.** A shelter's logo, or its initials.

**Props and variants.** `kind`: logo (`src`) or initials (`name`); `size`: sm, md, lg, xl (the shelter page header).

**Accessibility.** Decorative: the name is always shown as text beside it.

**Responsive.** lg and xl are smaller on a phone (xl: 96px, 160px from tablet).

**Example.**

```tsx
<Avatar kind="initials" name="Домівка друзів" />
```
