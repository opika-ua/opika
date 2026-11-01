# PerchedWords

File: `apps/web/src/ui/PerchedWords.tsx` (a client file: the line a word falls on is known only in the browser)

**Purpose.** Display-heading text with a `Mascot perch="word"` seated on the last word of the first line, so a wrap
never leaves the mascot over a line it does not belong to. Details of the perch, `--cap-offset` and the reserved
room: `Mascot.md`.

**Props.** `text` the heading string (split on spaces; the kit holds no copy), `mascot` a
`<Mascot perch="word" />`, `initial` the word index used by the server render (default: the last word).

**Rules.** Put it inside a `Heading` that also carries `MASCOT_RESERVE_CLASS[size]`. The words keep one space between
them, so the heading reads as the original string. It re-measures on resize and when the fonts load.

**Accessibility.** The mascot is `aria-hidden`; the heading text is unchanged for assistive tech.

**Example.**

```tsx
<Heading level={1} look="display-l" className={MASCOT_RESERVE_CLASS[48]}>
  <PerchedWords text={title} mascot={<Mascot kind="cat" pose="lie" size={48} perch="word" />} />
</Heading>
```
