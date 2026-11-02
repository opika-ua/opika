PR 1 of the kabinet shell work: one header frame for the public site and the kabinet.

- New kit primitive `HeaderFrame` (`apps/web/src/ui/HeaderFrame.tsx`, server component): full width, gutter `--spacing-header-gutter` = `clamp(16px, 3vw, 40px)`, inner cap `--container-header` = 1600px. Tokens in `globals.css`, documented in `docs/ui/tokens.md` and `docs/ui/components/HeaderFrame.md`, catalog row and `/dev/ui` entry added.
- `SiteHeader` and `KabinetHeader` both use it (the kabinet header's contents are unchanged). `Container` (page content) is untouched.
- Harness `header-frame.harness.ts`: logo x identical on /tvaryny and /kabinet at 1024, 1440, 1920, 2560; no sideways scroll at 320 on both.
- No copy, contract, auth or permission change.

Verification: tsc clean, guards and header/kabinet unit tests green, full harness run green except a flaky kabinet batch that passed on rerun. Lint: Biome run on changed files only with --diagnostic-level=error (whole-repo crashes on Windows); CI lints the whole repo.

Note: `Container` is max-w 1400 (not 1160) in the current code; left as is.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
