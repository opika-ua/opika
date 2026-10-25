# UI font: «Opika Variable» (self-hosted)

- **File:** `OpikaVariable-wght.woff2` (92,160 bytes, SHA-256
  `38afb1a2f6e1fe096f94e5d9d53ab9199fa7f247e88efbd34af55adb0fdbdb8e`). Supplied directly by
  Oleksii on 2026-10-25 (`D:\opika-worktrees\_incoming\fonts\ui\`), already converted to woff2;
  copied byte for byte.
- **What it is:** a renamed build of **Bellota Text** by Kemie Guaida (Bellota Project, 2019).
  The font's own name table says so: "derived from Bellota Text (Kemie Guaida)", version 5.003.
  The source variable TTF it was converted from, `OpikaVariablewght.ttf`, has SHA-256
  `0bef5667b5533abe4a6a4620224989388e2ddf1414ec8f7e41699d99d154345f` — checked against the
  supplied README before use; it is not vendored here, only the woff2.
- **Licence:** SIL Open Font License 1.1, stated in name ID 13. `OFL.txt` here is the Bellota
  Project's own copy, from `google/fonts` `ofl/bellotatext` (SHA-256
  `92938e2734b9280a9d4428c0fe4421b3e501641f78dafc7438fc19c0fc625c07`). The licence declares **no
  Reserved Font Name**, so a renamed derivative is allowed; web embedding and redistribution in
  a public repo are allowed as long as `OFL.txt` ships beside the font. `fsType` is 0
  (installable embedding).
- **Variable axis:** `wght` from 300 to 700, default 400 — covers the gallery-v3 type scale's
  500, 600 and 700 weights (`docs/design/README.md`'s type-scale table) from one file.
- **Glyph coverage:** 903 glyphs. Nothing is missing from the Ukrainian alphabet (А–я, Єє, Іі,
  Її, Ґґ), and U+02BC ʼ, « », „ ", ', — and № are all present.
- **Not subset,** same reasoning as every other family in this app: subsetting waits for
  `docs/build-plan.md`'s H3.5.
- **Only the variable file ships.** The static instances Oleksii also supplied
  (`Opika-{Light,Regular,Medium,SemiBold,Bold}.ttf`) are not vendored — three static weights
  would cost more than the one variable file, and `next/font/local`'s `weight: "300 700"` range
  form serves every weight the design uses from it.
