# Badge

File: `apps/web/src/ui/Badge.tsx`

**Purpose.** A small tag that sits on a photo.

**Props and variants.** `tone`: ink, neutral. No warning tone: freshness is never red or amber. There are no species tones: the gallery card's freshness chip is `gcard-fresh` (globals.css), a `page` chip with `ink` text and the `float` shadow from tablet, and species is only the small dot before the text (cat `accent`, dog `species-dog`), the same dot as the phone layout. Reserved keeps the ink Badge.

**Accessibility.** Text only; state is in the words.

**Responsive.** Content-sized.

**Example.**

```tsx
<Badge tone="ink">{uk.reserved.badge}</Badge>
```
