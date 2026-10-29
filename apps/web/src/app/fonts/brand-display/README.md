# Climate Crisis (self-hosted, YEAR axis pinned)

- **File:** `ClimateCrisis-static.woff2` (27,256 bytes, SHA-256
  `8eaecf67950ff8edd57a764e21d16532881b82d756415f9516096dfc5165ae9f`; the unsubset pinned instance
  was 162,640 bytes, SHA-256 `093abe3a5325e6cf8a9b7e2f5c4d519dc99cc28102312352b306cd4617c15fff`). Derived from upstream's
  variable font: the `YEAR` axis (range 1979–2050, default 1979) is pinned to the Figma frame's
  display weight, which reads at the axis default, so no visual change from upstream's own
  default rendering — only the variable machinery is stripped.
- **Source:** `google/fonts` repo, path `ofl/climatecrisis/ClimateCrisis[YEAR].ttf`, commit
  `33fdc2ecc74b1c080e97ea13bcaa9a5806539229` (2026-04-27, a licence-file-only sync; the font
  binary is unchanged since `8e3882135dddeb43f582ae88f337589dbba625f4` upstream, version 1.007).
  Upstream project: <https://github.com/dancoull/ClimateCrisis> by Daniel Coull and Eino Korkala.
- **Licence:** SIL Open Font License 1.1. `OFL.txt` here is a verbatim copy of
  `google/fonts`'s own copy at the same commit (SHA-256
  `ff2b5b1644c4fcdf1d5bea41205b694e0d865f3170301e4143a8b6f43ac72ebe`). Copyright line: "Copyright
  2020 The Climate Crisis Project Authors", no Reserved Font Name declared. `fsType` is 0
  (installable embedding).
- **Glyph coverage, checked before and after pinning:** every Ukrainian letter (U+0400–U+045F),
  Ґ/ґ (U+0490/0491), U+02BC ʼ, « » (U+00AB/00BB) and „ " (U+201E/201C) are present in both the
  variable source and the pinned static instance. `google/fonts` subsets list `cyrillic`,
  `cyrillic-ext`, `latin` and `latin-ext` for this family.
- **How it was produced** (`fonttools` 4.67.0, `brotli`):
  ```
  python -m fontTools varLib.instancer -o ClimateCrisis-static.ttf "ClimateCrisis[YEAR].ttf" YEAR=1979
  python -c "from fontTools.ttLib import TTFont; t=TTFont('ClimateCrisis-static.ttf'); t.flavor='woff2'; t.save('ClimateCrisis-static.woff2')"
  ```
  The intermediate static TTF (1,095,004 bytes) is not vendored — only the woff2 ships, same
  policy as the UI font in `../brand-ui/README.md`.
- **Subset by alphabet range (mobile performance pass, 2026-10-29),** not by the words in today's copy,
  so new Ukrainian text and user-entered names need no re-run: Basic Latin, Latin-1 and Latin
  Extended-A, combining accents U+0300-0308, Cyrillic U+0400-045F and Ґґ, ʼ, general punctuation
  U+2000-206F, euro, hryvnia, №, arrows U+2190-2193, minus and comparison signs. 457 glyphs of 3,447;
  every layout feature kept. Characters outside it fall back to the next font in the stack. Redo
  from the pinned instance above with:
  ```
  python -m fontTools.subset ClimateCrisis-static.woff2 --unicodes="U+0020-007E,U+00A0-017F,U+0300-0308,U+0400-045F,U+0490-0491,U+02BC,U+2000-206F,U+20AC,U+20B4,U+2116,U+2190-2193,U+2212,U+2260-2265" --layout-features='*' --flavor=woff2 --output-file=ClimateCrisis-static.woff2
  ```
- **One static weight, 400** — the only weight the Figma frame's title uses
  (`docs/design/README.md`'s gallery-v3 type scale, "Title «Каталог»": brand-display 400).
