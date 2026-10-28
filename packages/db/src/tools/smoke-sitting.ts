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
}

const AGAINST_PRODUCTION = /against\s+production/i;

function assembled(input: SmokeSittingInput): string {
  const worktreePath = `D:\\opika-worktrees\\${input.worktreeSlug}`;
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
pnpm --filter @opika/db db:neon-smoke --expect $ep
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
# Expected: ${input.expectedTotal} passed, 0 failed (was ${input.previousTotal} before this PR;
# ${input.newCheckDescription}). Any failure -> STOP, paste full output - this is new
# information about how the driver handles the change, not a formality.

---- Cleanup ----
cd D:\\Startup\\opika
git worktree remove ${worktreePath}

Paste back: the full neon-smoke output, or at minimum its last ~20 lines including the new check.
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
