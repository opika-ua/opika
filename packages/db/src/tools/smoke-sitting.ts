import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Renders the mechanical part of a smoke-sitting file (`Claude outputs/
 * SMOKE-sitting-<date>.txt`): the Setup/Smoke/Cleanup command block a
 * session pastes into PowerShell to run `db:neon-smoke` against a PR's exact
 * head before Oleksii merges a SQL-touching PR.
 *
 * Exists because a hand-written sitting (2026-10-28, the sex-filter PR) told
 * him to run the smoke "against production directly" - the smoke script's
 * own fixture writes ("Rows it writes stay on the branch, which is thrown
 * away", `neon-smoke.ts`) are only disposable on an actual child branch; run
 * against production's own connection string, they are not. His correction:
 * "smokes always run on a fresh child branch with PROD_NEON_ENDPOINT set,
 * never 'against production directly'." This generator makes that the only
 * shape the command block can take - the free-text fields (`migrationNote`,
 * `pointOfThisSmoke`) stay free text, but `render` refuses to return a
 * string containing the literal mistake, so a careless free-text edit can't
 * reintroduce it either.
 */

export interface SmokeSittingInput {
  /** One-line title, e.g. "Sex-filter PR". */
  title: string;
  /** ISO date, e.g. "2026-10-28". */
  date: string;
  prNumber: number;
  branch: string;
  sha: string;
  /** Free text: what changed and why this smoke exists (the "Migration kind" paragraph). */
  migrationNote: string;
  /** Free text: what this specific smoke proves that the local suite can't. */
  pointOfThisSmoke: string;
  /** Slug for the throwaway worktree, e.g. "sex-filter-smoke". */
  worktreeSlug: string;
  /** Total checks expected to pass after this PR. */
  expectedTotal: number;
  /** Total checks on `main` before this PR. */
  previousTotal: number;
  /** What's new since `previousTotal`, for the "Expected" comment. */
  newCheckDescription: string;
  /**
   * A PR with a migration, by its journal tag: the child branch is migrated before its smoke,
   * and the production migration (never a smoke) follows only once that smoke passed in full.
   */
  migration?: { tag: string };
  /**
   * A PR with the settlement import (nationwide N2): after the smoke, on the same child branch, the
   * import runs as a dry run, with `--commit`, as a dry run again (all zeros), and again after a
   * reseed. The import refuses a production target whatever flags it is given, so there is no
   * production block. `expected` lines become the sitting's "# Expected" comments, one per step.
   */
  settlementImport?: {
    /** Where the codifier is downloaded from, and the sha256 it must have (the importer pins it too). */
    download: { url: string; sha256: string };
    expectedFirstPlan: string;
    expectedAfterCommit: string;
    expectedRerun: string;
    expectedAfterReseed: string;
    /**
     * Nationwide N3: after the import, on the same child branch, a read-only step that prints the
     * 20 search timings and the `EXPLAIN (ANALYZE, BUFFERS)` plans (`db:neon-smoke-timings`). It
     * needs the imported table to mean anything, so it runs here and not inside the smoke, which
     * runs first (the import renames the seeded slugs the earlier checks look for).
     */
    timings?: { expected: string };
  };
}

const AGAINST_PRODUCTION = /against\s+production/i;

/** The migration variant's extra lines; empty strings leave a plain smoke sitting unchanged. */
function migrationParts(migration: SmokeSittingInput["migration"]) {
  if (migration === undefined) {
    return {
      childSteps: "",
      endpointRemovedAfterSmoke: "Remove-Item Env:PROD_NEON_ENDPOINT\n",
      childExpected: "",
      productionStep: "",
      pasteBack: "",
    };
  }
  return {
    childSteps:
      "pnpm --filter @opika/db db:migrate --expect $ep\npnpm --filter @opika/db db:check-hashes\n",
    // Kept until the production step: `--prod` identifies production by this id.
    endpointRemovedAfterSmoke: "",
    childExpected: `# Expected first: ${migration.tag} applied, then every hash "match" (${migration.tag} included).\n`,
    productionStep: `
---- Production migration (only after every check above passed; no smoke runs here) ----
$env:DATABASE_URL = Read-Secret "Production connection string (for db:migrate and db:check-hashes only)"
pnpm --filter @opika/db db:migrate --prod --expect (Read-Host "Type the production endpoint id again (ep-...)")
pnpm --filter @opika/db db:check-hashes
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
# Expected: ${migration.tag} applied; every hash "match". Any refusal or failure -> STOP, paste it.
`,
    pasteBack: " Then the production migration's full output.",
  };
}

/** The import block: empty for a sitting without one. Uses the `$ep` the smoke block already set. */
function importParts(settlementImport: SmokeSittingInput["settlementImport"]): string {
  if (settlementImport === undefined) return "";
  return `
---- Settlement import, on the same child branch (the script refuses a production target outright) ----
$xlsx = Join-Path $env:TEMP "kodifikator-07-07.xlsx"
Invoke-WebRequest -Uri "${settlementImport.download.url}" -OutFile $xlsx
$hash = (Get-FileHash -Algorithm SHA256 $xlsx).Hash.ToLower()
$hash
if ($hash -ne "${settlementImport.download.sha256}") { throw "STOP: the file's sha256 is not ${settlementImport.download.sha256}. Do not import it; paste this back." }
# If the link has moved: download the file by hand and set $xlsx to its path instead, e.g.
#   $xlsx = "C:\\path\\kodifikator-07-07.xlsx"   (strip the quotes from a "Copy as path" path). The checksum check above still applies. Do not commit the file.
pnpm --filter @opika/db db:import-settlements --expect $ep --file $xlsx
# Expected (dry run, writes nothing): ${settlementImport.expectedFirstPlan}
pnpm --filter @opika/db db:import-settlements --expect $ep --file $xlsx --commit
# Expected: ${settlementImport.expectedAfterCommit}
pnpm --filter @opika/db db:import-settlements --expect $ep --file $xlsx
# Expected (rerun, dry): ${settlementImport.expectedRerun}
$dbName = ([uri]$env:DATABASE_URL).AbsolutePath.TrimStart('/')
pnpm --filter @opika/db db:seed --profile=demo --force --db-name=$dbName
pnpm --filter @opika/db db:import-settlements --expect $ep --file $xlsx
# Expected (after a reseed, dry): ${settlementImport.expectedAfterReseed}
${timingParts(settlementImport.timings)}`;
}

/** The timing block: empty unless the sitting asks for it. Runs on the imported child branch. */
function timingParts(timings: { expected: string } | undefined): string {
  if (timings === undefined) return "";
  return `
---- Timings and plans, same child branch, after the import (read-only; it prints and asserts nothing) ----
pnpm --filter @opika/db db:neon-smoke-timings --expect $ep
# Expected: ${timings.expected}
`;
}

function importPasteBack(settlementImport: SmokeSittingInput["settlementImport"]): string {
  if (settlementImport === undefined) return "";
  const timings =
    settlementImport.timings === undefined
      ? ""
      : " Also paste the whole db:neon-smoke-timings output (the probes and every plan).";
  return ` Also paste ALL FOUR import outputs (dry run, commit, rerun, rerun after the reseed) in full. A second-plan count of 1-8 means a legacy city's name differs from the codifier: paste it back, do not retry.${timings}`;
}

function assembled(input: SmokeSittingInput): string {
  const worktreePath = `D:\\opika-worktrees\\${input.worktreeSlug}`;
  const m = migrationParts(input.migration);
  return `${input.title} - merge sitting, ${input.date}. PowerShell.
${input.migrationNote}

PR #${input.prNumber}: ${input.branch} @ ${input.sha} - confirm with the session this still
matches the PR's current head before running.

${input.pointOfThisSmoke}

---- Setup (paste once) ----
nvm use 24
cd D:\\Startup\\opika
git fetch
git worktree add --detach ${worktreePath} ${input.sha}
cd ${worktreePath}
git log -1 --oneline
pnpm i
function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

---- Smoke, on a fresh Neon child branch (create one first if this sitting needs its own) ----
$env:DATABASE_URL = Read-Secret "Child branch connection string (never production's own)"
$env:PROD_NEON_ENDPOINT = Read-Secret "Production Neon endpoint id (ep-..., so the script can refuse a target that matches it)"
$ep = ([uri]$env:DATABASE_URL).Host.Split('.')[0] -replace '-pooler$',''
$ep
${m.childSteps}pnpm --filter @opika/db db:neon-smoke --expect $ep
${importParts(input.settlementImport)}Remove-Item Env:DATABASE_URL
${m.endpointRemovedAfterSmoke}${m.childExpected}# Expected: ${input.expectedTotal} passed, 0 failed (was ${input.previousTotal} before this PR;
# ${input.newCheckDescription}). Any failure -> STOP, paste full output - this is new
# information about how the driver handles the change, not a formality.
${m.productionStep}
---- Cleanup ----
cd D:\\Startup\\opika
git worktree remove ${worktreePath}

Paste back: the full neon-smoke output, or at minimum its last ~20 lines including the new check.${m.pasteBack}${importPasteBack(input.settlementImport)}
`;
}

/**
 * Throws rather than returning a string containing the mistake this file
 * exists to prevent - a free-text field (`migrationNote`, `pointOfThisSmoke`,
 * `title`) is the only way that phrase could still get in, since the fixed
 * template parts never say it.
 */
export function renderSmokeSitting(input: SmokeSittingInput): string {
  const text = assembled(input);
  const match = AGAINST_PRODUCTION.exec(text);
  if (match !== null) {
    throw new Error(
      `renderSmokeSitting refuses to produce a sitting containing "${match[0]}" - ` +
        "smokes always run on a fresh Neon child branch, never against production itself. " +
        "Check the free-text fields (migrationNote, pointOfThisSmoke, title).",
    );
  }
  return text;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as SmokeSittingInput;
  process.stdout.write(renderSmokeSitting(input));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
