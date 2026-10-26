# gallery-v3 brand assets

`logo.svg` — the header lockup (mark + wordmark), from the design handoff
(`D:\opika-worktrees\_incoming\figma-gallery\logo.svg`, Figma file
`euz4JGfpToY31VJY7ppVj9`, node `58:1617`). Copied verbatim except for one
thing: the source file carried an embedded C2PA content-credentials
manifest (a base64 blob inside `<metadata>`, ~7.7 KB of the original's
~16 KB) recording that the asset-prep tool was Claude — provenance
metadata, not rendered content. Stripped here because it does not affect
how the SVG renders (same paths, same `width`/`height`/`viewBox`
attributes, unchanged) and halves the file's weight for no visual cost.

Multi-coloured (a dog-and-cat mark plus the "Opika" wordmark, both drawn
as vector paths with literal hex fills) — kept as a static asset and
rendered with a plain `<img>` rather than inlined as JSX or reused with
Tailwind's `currentColor`, unlike the gallery's small monochrome icons
(`features/gallery/icons.tsx`), because recolouring doesn't apply to a
fixed multi-colour logotype.

Excluded from Biome by a file-specific entry in the root `biome.json`
(`!apps/web/public/brand-v3/logo.svg`), not a directory-level one: Biome's
`lint/a11y/noSvgWithoutTitle` flags this file as if it were going to be
inlined, which it never is (consumed only via `<img src>`, where an
internal `<title>` has no accessibility effect at all). A *directory*
exclusion (`!apps/web/public/brand-v3` or `/**`) reproduced a real,
repeatable Biome engine crash (`biome check .`, exit `3221225477` — a
Windows access violation) specifically when scanning from the repo root
with the VCS-ignore-file integration on; the identical directory checked
on its own, or the same pattern scoped to one file, did not crash. Keep
this exclusion file-specific if more assets land in this folder later —
add each one by name, don't widen back to the directory.
