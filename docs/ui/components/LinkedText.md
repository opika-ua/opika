# LinkedText

File: `apps/web/src/ui/LinkedText.tsx` (tokenizer: `apps/web/src/ui/linkify.ts`)

**Purpose.** Shelter-written text (an animal's story and medical notes, «Про притулок») with its web links clickable.

**Props and variants.** `text: string`. Renders inline, so it goes inside a `Text` or `<p>` that sets the type and keeps line breaks. No variants.

**Behaviour.** `linkParts` splits the text into plain runs and links; nothing is parsed as HTML and React escapes every run. Only `https://` and `http://` URLs become links, never `javascript:`, `data:`, a bare domain or a URL with a user name before the host. Trailing sentence punctuation, an unmatched closing bracket, «», quotes and glued-on Cyrillic stay outside the link. The label drops the protocol (`hatul-madan.org/blogs/fiv`); the `href` is the full URL.

**Accessibility.** Underlined, in `accent-text` (colour is not the only cue). Visible focus. Opens in a new tab with `rel="nofollow ugc noopener noreferrer"`. The link's name is its address.

**Responsive.** `overflow-wrap: anywhere`, so a long address breaks instead of widening the page.

**Example.**

```tsx
<Text look="lead">
  <LinkedText text={description} />
</Text>
```
