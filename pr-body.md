## What
- Accent Button fill is now `accent-strong` #D9531A (button-only token); label is the new `text-cta` token (19px, 700) at every size and breakpoint, so white on the fill passes WCAG 1.4.3 as large text. Measured: 3.82:1 (white is #FAF8F9), 19px / 700 at 393 and 1440, in the animal page header and the phone sticky bar. Copy unchanged.
- Gallery card freshness: one style for both species. From tablet a `page` chip, `ink` text, `shadow-float`, same size/radius; species is only the small dot before the text (cat accent, dog species-dog), same as the phone. Reserved badge untouched.
- Removed: Badge `dog` and `cat` tones (only the dev/ui showcase used them), the `--on-dot` variable. Tokens `species-dog` and `species-cat` stay (dot, mascots, medical status).
- Other users of the accent Button variant: none besides the animal reveal button (`RevealFlow`) and the /dev/ui showcase. Chip accent and other accent fills keep #F26427.
- Docs: tokens.md (accent-strong, text-cta, contrast table), Button.md, Badge.md. Tests are token pins (Button.test.tsx, GalleryCard.test.tsx).

## Check
pnpm check: typecheck, test (all packages) green; whole-repo Biome segfaults on Windows (0xC0000005) in the ratchet step, so changed files were linted with `--diagnostic-level=error` (clean); CI lints the whole repo. Screenshots are in the owner's Claude outputs folder.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
