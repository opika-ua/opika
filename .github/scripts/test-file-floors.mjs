// The test files vitest must run per package, summed over the shards. `--passWithNoTests` (packages/ui
// has fewer files than shards) would let a package's tests vanish silently; `check` fails below these.
// Raise a floor when you add test files; lower it only when deleting tests on purpose.
export const TEST_FILE_FLOORS = {
  "apps/web": 364,
  "packages/contracts": 10,
  "packages/db": 131,
  "packages/domain": 54,
  "packages/i18n": 10,
  "packages/ui": 1,
};

/** The `test` matrix in .github/workflows/ci.yml has this many shards (pinned by its test). */
export const SHARDS = 3;
