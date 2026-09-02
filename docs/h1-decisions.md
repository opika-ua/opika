# H1 decisions — made without you in the room, for review when you're back

Every number below was read from the actual mock frames (`docs/design/Opika Registry System.dc.html`'s B1/B2/B7, `Opika Registry Frames.dc.html`'s D1/D2), not the README's prose summary and not guessed. Where I made a real judgment call rather than transcribing a mock value, it's marked **DECISION** — those are the ones worth your attention when you're back; everything else is just arithmetic from measured pixels.

## Variant sizes

Measured real render widths, per context, per breakpoint:

| Context | Mock frame | 1x width | 2x target |
|---|---|---|---|
| Gallery card (4-col, 1920) | B1 | 312px | 624px |
| Gallery card (1-col, 360) | B2 | 304px | 608px |
| Detail main photo (desktop) | D1 | 560px | 1120px |
| Detail main photo (mobile) | D2 | 360px, **fixed height 380px, not 4:5** | 720×760 |
| Detail thumbnails (×3) | D1 | 88×88 | 176×176 |
| Deck card | B7 (label: "картка 358 у 390") | 334×400 (inside the 358px card, after its own 12px padding) | 668×800 |

**DECISION — three variants, not one per context.** `object-fit: cover` is already used everywhere a photo renders (confirmed in the actual card/detail markup), so a 4:5-shaped source safely fills a non-4:5 box like D2's mobile hero (360×380 ≈ 19:20) — cover just crops the small excess, no distortion. That collapses six measured targets into three variants with headroom:

- **`thumb`** — 176×176 — covers the 88px thumbnails at 2x
- **`card`** — 640×800 (4:5) — covers gallery card (624/608 max) and deck card (668 max) at 2x, all with margin
- **`detail`** — 1120×1400 (4:5) — covers the detail main photo at 2x exactly, and safely cover-crops into D2's non-4:5 mobile box

If this turns out wrong once real photos exist (e.g. `card` reads soft on some device), it's a constant to change in one place (`packages/db/src/image-pipeline/variants.ts`), not a rearchitecture.

**DECISION — output format: WebP.** Broad support, real compression win over JPEG, `sharp` handles it natively. Not AVIF (slower encode, still-inconsistent decode support isn't worth it for a project this size); not kept-as-JPEG (no reason to give up the compression). Worth a second look if you have a format preference — this is genuinely just a default, not derived from anything in the mock.

## Storage key convention

`AnimalPhoto.storageKey` (`packages/domain/src/animals/photo.ts`) is documented as deliberately *not* a URL and *not* variant-specific — "baking variant naming or CDN host into stored data would make changing them a data migration." `Animal.photos` is an ordered array (`photos[0]` is primary, per `primaryPhoto()`), no per-photo id.

**DECISION**: `storageKey = animals/{animalId}/{photoIndex}` — e.g. `animals/a0000000-.../0`. The actual R2 objects are derived from it, never stored: `{storageKey}/{variant}.webp` → `animals/a0000000-.../0/card.webp`. The loader is the only place that knows variants exist; the domain type stays exactly as documented.

## Env vars — and the one that can break the next deploy if missed

Per your instruction, the web app requires only the public read side; write credentials never reach Vercel — same shape as `LOCATION_HMAC_SECRET`'s split, for the same reason (the onboarding script runs from an operator's machine, never through the deployed instance):

- **Operator-only, local shell, never in Vercel**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- **Deployed app, `validateEnv()`'s required schema**: `R2_PUBLIC_BASE_URL`

**This is a real risk, not a formality — flagging it loudly rather than burying it in a diff.** Unlike `LOCATION_HMAC_SECRET` (deliberately kept *out* of the required schema to avoid exactly this), `R2_PUBLIC_BASE_URL` going into `validateEnv()`'s required list means **the next production deploy refuses to boot if it isn't set in Vercel first** — `validateEnv()` runs at `instrumentation.ts`'s `register()`, before the instance accepts its first request, same as `DATABASE_URL`/`CURSOR_HMAC_SECRET` today. Today's live site has zero real R2-hosted photos (every animal is still a seed placeholder, which never touches R2 at all), so this env var currently does nothing for the live site — until this code merges, at which point it becomes load-bearing immediately. **Action item, blocking, before this branch merges to `main`: set `R2_PUBLIC_BASE_URL` in Vercel (Production and Preview).** I can't do this myself — same reason I couldn't generate `LOCATION_HMAC_SECRET`'s value for you, except this one actually breaks the site if skipped, that one didn't.

Local dev and the harness are unaffected either way — `validateEnv()` only enforces when `NODE_ENV === "production"`, so nothing here changes what you need running locally.

## What stays unverified until a real bucket exists

Per your rule 1 — listed explicitly, not asserted as done:

- The R2 client's actual `PutObject`/`GetObject` calls against Cloudflare's S3-compatible endpoint
- CORS configuration on the real bucket
- Content-type headers actually served back by R2/the CDN
- Auth (does the access key/secret pair actually authenticate)
- Whether `R2_PUBLIC_BASE_URL` + a real object key actually resolves to a working image over HTTP

Per rule 2 — the adapter carrying all of that is a `put(key, buffer, contentType)` / `get(key)` interface, nothing else. Every decision above it (which variants, what key, what URL) is a pure function, tested with real image fixtures and no network.
