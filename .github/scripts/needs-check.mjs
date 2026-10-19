// Reads a pull request's changed paths (one per line) on stdin and prints `true` when the full
// `check` job has to run, `false` when the change is documentation only.
//
// Oleksii, 2026-10-19, verbatim: "Docs-only: use paths-ignore for docs-only changes (docs/**,
// **/*.md, except anything under packages/i18n). A required check skipped this way must still
// report success, so branch protection doesn't block docs PRs." A workflow-level `paths-ignore`
// would leave the required `check` pending, so the workflow always runs and this decides whether
// `check` is skipped (a skipped job reports success).
//
// Documentation only means every path is a .md file or under docs/design/, and none is under
// apps/ or packages/. Those two hold the code, and files there are read by it: the copy
// catalogues (packages/i18n, his exception), files the app serves (apps/web/public; a test reads
// its SOURCES.md), and every .md under them, which allowlist-removed.test.ts scans. Anything else
// under docs/ isn't documentation either: biome lints docs/ outside docs/design. No paths at all
// reads as code: the check runs whenever this can't tell.
import { readFileSync } from "node:fs";

const CODE_TREE = /^(apps|packages)\//;
const DOCUMENTATION = /\.md$|^docs\/design\//i;

function needsCheck(paths) {
  const files = paths.map((path) => path.trim()).filter((path) => path !== "");
  if (files.length === 0) return true;
  return files.some((path) => CODE_TREE.test(path) || !DOCUMENTATION.test(path));
}

process.stdout.write(`${needsCheck(readFileSync(0, "utf8").split("\n"))}\n`);
