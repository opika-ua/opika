# PWA icons

Generated from the logo's mark (the wordmark is dropped): source `../brand-v3/logo.svg`
(provenance in `../brand-v3/README.md`), on the `--color-page` background.

Regenerate: `pnpm --filter @opika/web run icons:generate` (`scripts/generate-pwa-icons.mjs`, sharp).

- `icon-192.png`, `icon-512.png`: purpose `any`
- `icon-maskable-512.png`: purpose `maskable`, mark inside the central 60%
- `src/app/apple-icon.png`: 180x180, the Next file convention (keeps `app/icon.svg`'s favicon link)
- `src/pwa-colors.ts`: `--color-page` as RGB, written by the same script (no runtime file read)
- `src/app/favicon.ico` (16, 32 and 48px, PNG-encoded), `src/app/icon1.png` (48px) and `src/app/icon2.png` (192px):
  the favicons Google and browsers read. Rendered once with sharp from `src/app/icon.svg` (the transparent mark), not by
  `icons:generate`; regenerate them by hand if `icon.svg` changes.
