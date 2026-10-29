# Windows, line endings and module resolution

Moved verbatim from CLAUDE.md in DS PR 5 (setup notes, read when setting up or when a build fails on an import path).

## Windows development notes

You're developing on Windows. Two things matter here:

- **Line endings:** `.gitattributes`' `* text=auto eol=lf` doesn't just
  normalize line endings _in the repo_ - the `eol=lf` attribute overrides
  `core.autocrlf` for every matched file (which is all of them) and forces
  LF in your working tree too, on Windows included. That's deliberate:
  it means every tracked file is LF on disk regardless of what
  `core.autocrlf` is set to, so there's nothing else to configure for
  files this repo already tracks. Modern editors (VS Code, WebStorm) save
  LF files as LF without complaint. `core.autocrlf` still matters for
  _new, untracked_ files you create before they're covered by a
  `.gitattributes` pattern - `git config --global core.autocrlf input` is
  the safer default on Windows (normalizes CRLF→LF on commit, doesn't
  force CRLF back on checkout), but don't expect it to change anything
  for files already in this repo.
- **corepack:** run `corepack enable` once (may need an elevated
  terminal the first time on Windows). After that, `pnpm` resolves to
  the exact version pinned in `package.json`'s `packageManager` field -
  don't install pnpm globally via npm. Node 24 (this project's pinned
  major - `.nvmrc` / `.node-version` select it for nvm, fnm and the like,
  matching `engines` and CI) still bundles Corepack; Node 25+ drops it from the default
  distribution, so a future Node upgrade will need `npm install -g
corepack` first. In CI, prefer `corepack enable && corepack install`
  (activates the pinned version explicitly) over a bare `corepack enable`
  followed by an implicit lazy download - the latter can hit Corepack's
  interactive download-confirmation prompt, which doesn't reliably
  suppress via `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` on every Corepack
  version. See `.github/workflows/ci.yml` for the pattern in practice.

## Module resolution (why `pnpm typecheck` is not enough)

The whole repo is on `module: ESNext` / `moduleResolution: Bundler`.
**Relative imports are extensionless** - `./freshness-display`, never
`./freshness-display.js`.

This is not cosmetic. `tsc` maps `./x.js` to `./x.ts` under *every*
resolution mode, so a `.js` extension typechecks perfectly clean and then
fails only in the bundler, which looks for a literal `x.js` on disk.
That is exactly how `/discovery` shipped to a green CI while being
unbuildable. Turbopack has no escape hatch here -
`experimental.extensionAlias` is on its explicitly-unsupported list.

`packages/*` were previously NodeNext, which mandates the extensions.
That bought nothing: all three are `noEmit`, are exported as
`./src/index.ts`, and have no raw-Node-ESM consumer (vitest uses Vite,
`db:seed` uses `tsx`, drizzle-kit bundles). Its only observable effect
was breaking the one bundler that does read those specifiers.

**`pnpm build:web` is therefore a required gate, in `check` and in CI.**
Typecheck structurally cannot catch this class of break. If you add a
frontend surface, it stays behind that gate.

One residual to know about: `module: ESNext` means TS no longer checks
Node's ESM↔CJS interop rules for `pnpm --filter @opika/db db:seed`, the repo's only real
Node-ESM entry point. No live exposure today (`postgres` resolves ESM,
`drizzle-orm` and `zod` are dual), but a CJS-only dependency added to
`packages/db` and named-imported would typecheck and fail at seed time.

