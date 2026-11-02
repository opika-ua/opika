# Fonts for link-preview images

satori (behind `next/og`) reads TTF, not woff2, so these are static TTF subsets of the two page fonts,
not new typefaces. Licences: `OFL-ClimateCrisis.txt`, `OFL-OpikaUi.txt` (SIL OFL 1.1, same as the
sources in `../brand-display` and `../brand-ui`). Not loaded by the browser; read at request time by
`src/seo/og-image.tsx`.

- `ClimateCrisis-og.ttf`: `../brand-display/ClimateCrisis-static.woff2` unwrapped to TTF.
- `OpikaUi-700-og.ttf`: `../brand-ui/OpikaVariable-wght.woff2` pinned to `wght=700` with
  `fontTools.varLib.instancer` (satori cannot use a variable font), then subset.
- Both subset to Basic Latin, Latin-1, Cyrillic U+0400-045F, Ґґ, ʼ, dashes, quotes, «», №, ₴:
  `U+0020-007E,U+00A0-017F,U+0400-045F,U+0490-0491,U+02BC,U+2010-2015,U+2018-201E,U+2026,U+00AB,U+00BB,U+2116,U+20B4`.
