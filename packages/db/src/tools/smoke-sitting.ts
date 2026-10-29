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
   * reseed. This block is the child-branch rehearsal and never passes `--prod`; the production
   * import is its own part of `renderProductionImportSitting`. `expected` lines become the sitting's "# Expected" comments, one per step.
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
---- Settlement import, on the same child branch (the rehearsal: no production flag here) ----
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

/**
 * The combined sitting for the production settlement import: ONE file with two parts that run from
 * two checkouts. Part 1 is an ordinary child-branch sitting (`rehearsal`, rendered by the same code
 * as every other); Part 2 imports into production from the importing PR's own head, with a restore
 * point and a typed confirmation before the only write. Never hand-written, for the same reason as
 * the rest of this file.
 */
export interface ProductionImportSittingInput {
  title: string;
  date: string;
  /** Part 1. Must carry `settlementImport` (with `timings`): the rehearsal is import-shaped. */
  rehearsal: SmokeSittingInput;
  production: {
    prNumber: number;
    branch: string;
    /** The PR head Part 2 runs from; it holds the guard that allows `--prod --expect`. */
    sha: string;
    worktreeSlug: string;
    download: { url: string; sha256: string };
    /** The Neon branch the owner makes from production right before the commit. */
    restoreBranchName: string;
    /** The tag of the last migration that must already be on production. */
    lastMigrationTag: string;
    /** How many migrations the journal has, all of which must read "match". */
    migrationCount: number;
    expected: {
      beforeReferences: string;
      dryRun: string;
      afterCommit: string;
      rerun: string;
      afterReferences: string;
      site: string;
    };
  };
}

function productionPart(input: ProductionImportSittingInput): string {
  const p = input.production;
  const worktreePath = `D:\\opika-worktrees\\${p.worktreeSlug}`;
  return `
=====================================================================================
PART 2: the production import. Runs from PR #${p.prNumber} (${p.branch}) @ ${p.sha}
Only after Part 1 passed in full (the numbers it expects), and only after the session
has confirmed this SHA is still the PR's head and the reviewer's verdict stands.
=====================================================================================
Migration kind: none. No schema change: the data import of the 2026-07-07 codifier into cities
(29,703 settlements). It adopts the 8 legacy cities in place (their ids, so every shelter and animal
reference, stay), writes slug aliases before any rename, and is idempotent: a crash is completed by
rerunning the same command. The only write is the --commit step, behind a typed confirmation.

---- Setup (paste once) ----
nvm use 24
cd D:\\Startup\\opika
git fetch
git worktree add --detach ${worktreePath} ${p.sha}
cd ${worktreePath}
git log -1 --oneline
pnpm i
function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

---- The file (same download and checksum as Part 1) ----
$xlsx = Join-Path $env:TEMP "kodifikator-07-07.xlsx"
Invoke-WebRequest -Uri "${p.download.url}" -OutFile $xlsx
$hash = (Get-FileHash -Algorithm SHA256 $xlsx).Hash.ToLower()
$hash
if ($hash -ne "${p.download.sha256}") { throw "STOP: the file's sha256 is not ${p.download.sha256}. Do not import it; paste this back." }
# If the link has moved: download the file by hand and set $xlsx to its path instead, e.g.
#   $xlsx = "C:\\path\\kodifikator-07-07.xlsx"   (strip the quotes from a "Copy as path" path). The checksum check above still applies. Do not commit the file.

---- Production connection (read without echo; never printed) ----
$env:DATABASE_URL = Read-Secret "PRODUCTION connection string"
$env:PROD_NEON_ENDPOINT = Read-Secret "Production Neon endpoint id (ep-...)"
$ep = ([uri]$env:DATABASE_URL).Host.Split('.')[0] -replace '-pooler$',''
$ep
if ($ep -ne ($env:PROD_NEON_ENDPOINT.Trim().ToLower() -replace '-pooler$','')) { throw "STOP: the connection string is not the production endpoint you typed. Nothing was run." }

---- Pre-flight (read-only) ----
pnpm --filter @opika/db db:check-hashes
# Expected: first line 'Target: Neon endpoint ' + the endpoint; all ${p.migrationCount} migrations 'match', through ${p.lastMigrationTag}; no 'not run', 'MISMATCH', 'SKIPPED' or 'UNKNOWN' line. Anything else -> STOP, paste it.
pnpm --filter @opika/db db:city-references --prod --expect $ep
# Expected: ${p.expected.beforeReferences}
# SAVE the 'Reference fingerprint' line: the same command runs again after the commit and must print the same value.

---- Dry run (writes nothing) ----
pnpm --filter @opika/db db:import-settlements --prod --expect $ep --file $xlsx
# Expected: ${p.expected.dryRun}
# Any refusal, any difference in the counts above, or a '!!! WARNING' line -> STOP, paste the output, do not continue.

---- Restore point, then the typed confirmation (the only way past this is typing the endpoint again) ----
# In the Neon console: create a branch of PRODUCTION right now (parent: production, current data), named ${p.restoreBranchName}
# (Part 1's child branch is a rehearsal that now holds fixtures and the imported data: it is not a restore point).
$named = Read-Host "Type the name of the restore branch you just created"
if ($named.Trim() -ne "${p.restoreBranchName}") { throw "STOP: make the restore branch first. Nothing was written." }
$typed = Read-Host "Type the production endpoint id ($ep) to confirm the write"
if ($typed.Trim().ToLower() -ne $ep) { throw "STOP: not confirmed. Nothing was written." }

---- Commit (the write; aliases are written before any rename, 500-row statements, as the child branch run did) ----
pnpm --filter @opika/db db:import-settlements --prod --expect $ep --file $xlsx --commit
# Expected: ${p.expected.afterCommit}
# If the run dies part way: do not retry blindly. Paste the output; rerunning the same command completes it (idempotent), and the restore branch is the way back.

---- Dry rerun (writes nothing) ----
pnpm --filter @opika/db db:import-settlements --prod --expect $ep --file $xlsx
# Expected: ${p.expected.rerun}

---- Post-checks (read-only) ----
pnpm --filter @opika/db db:city-references --prod --expect $ep
# Expected: ${p.expected.afterReferences}
$site = Read-Host "Production site base URL (https://...)"
curl.exe -s -o NUL -w "%{http_code}\`n" "$site/tvaryny"
curl.exe -s -o NUL -w "%{http_code}\`n" "$site/tvaryny?misto=brovary"
# Expected: ${p.expected.site}

---- Cleanup ----
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
Remove-Item $xlsx
cd D:\\Startup\\opika
git worktree remove ${worktreePath}

Paste back (Part 2): every output above in full, from db:check-hashes to the curl status codes, including both 'Reference fingerprint' lines and the commit's search probes. If anything stopped the run, paste exactly where, and do nothing further.
`;
}

/** Renders the combined production-import sitting; refuses the phrase every sitting refuses. */
export function renderProductionImportSitting(input: ProductionImportSittingInput): string {
  if (input.rehearsal.settlementImport === undefined) {
    throw new Error("the rehearsal part must carry settlementImport (the import-shaped sitting)");
  }
  const r = input.rehearsal;
  const p = input.production;
  const text = `${input.title} - combined sitting, ${input.date}. PowerShell.
TWO PARTS, TWO CHECKOUTS. Confirm BOTH SHAs with the session before running anything:
  Part 1 (child-branch rehearsal, the cities.search UNION smoke): PR #${r.prNumber} ${r.branch} @ ${r.sha}
  Part 2 (production import): PR #${p.prNumber} ${p.branch} @ ${p.sha}
Part 1 runs from the not-yet-merged search PR on a FRESH child branch. Part 2 runs from the import
PR's own head (the search PR only changes cities.search, which the import uses just for its probes).
Both PRs are merged after this sitting, not before. Do Part 2 only if Part 1 passed in full.

=====================================================================================
PART 1: child-branch rehearsal. Runs from PR #${r.prNumber} (${r.branch}) @ ${r.sha}
=====================================================================================
${assembled(r)}${productionPart(input)}`;
  const match = AGAINST_PRODUCTION.exec(text);
  if (match !== null) {
    throw new Error(
      `renderProductionImportSitting refuses to produce a sitting containing "${match[0]}"; ` +
        "smokes run on a child branch, and the production part says what it does to production.",
    );
  }
  return text;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as
    | SmokeSittingInput
    | ProductionImportSittingInput;
  process.stdout.write(
    "rehearsal" in input ? renderProductionImportSitting(input) : renderSmokeSitting(input),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
