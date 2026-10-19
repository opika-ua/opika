// Reads a pull request's changed paths (one per line) on stdin and prints `true` when the full
// `check` job has to run, `false` when the change is documentation only.
//
// Oleksii, 2026-10-19, verbatim: "Docs-only: use paths-ignore for docs-only changes (docs/**,
// **/*.md, except anything under packages/i18n). A required check skipped this way must still
// report success, so branch protection doesn't block docs PRs." A workflow-level `paths-ignore`
// would leave the required `check` pending, so the workflow always runs and this decides whether
// `check` is skipped (a skipped job reports success).
//
// Documentation only means every path is under docs/ or is a .md file, and none is under
// packages/i18n/ (the copy catalogues) or apps/web/public/ (served by the app; a test reads its
// SOURCES.md). No paths at all reads as code: the check runs whenever this can't tell.
import { readFileSync } from "node:fs";

const ALWAYS_CODE = /^(packages\/i18n|apps\/web\/public)\//;
const DOCUMENTATION = /^docs\/|\.md$/i;

function needsCheck(paths) {
  const files = paths.map((path) => path.trim()).filter((path) => path !== "");
  if (files.length === 0) return true;
  return files.some((path) => ALWAYS_CODE.test(path) || !DOCUMENTATION.test(path));
}

process.stdout.write(`${needsCheck(readFileSync(0, "utf8").split("\n"))}\n`);
