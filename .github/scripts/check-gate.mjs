// The required `check`: reads the workflow's `needs` (toJSON) from $NEEDS and exits 0 only when
// `classify` succeeded and either the change is documentation only (the gated jobs skipped) or
// every other job succeeded and the shards ran at least the pinned test files ($TEST_FILES_DIR).
// A skipped required check counts as passing, so every non-success must fail here instead.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SHARDS, TEST_FILE_FLOORS } from "./test-file-floors.mjs";

const say = (line) => process.stdout.write(`${line}\n`);

/** What is wrong with the shards' file counts in `dir` (shard-<n>.json each), against the floors. */
function countProblems(dir) {
  if (!dir) return ["no directory of shard file counts"];
  const problems = [];
  const totals = {};
  for (let shard = 1; shard <= SHARDS; shard++) {
    const path = join(dir, `shard-${shard}.json`);
    if (!existsSync(path)) {
      problems.push(`shard ${shard}: no file counts`);
      continue;
    }
    try {
      for (const [pkg, files] of Object.entries(JSON.parse(readFileSync(path, "utf8")))) {
        if (!Number.isInteger(files) || files < 0) throw new Error(`${pkg}: ${files}`);
        totals[pkg] = (totals[pkg] ?? 0) + files;
      }
    } catch (error) {
      problems.push(`shard ${shard}: unreadable file counts (${error.message})`);
    }
  }
  for (const [pkg, floor] of Object.entries(TEST_FILE_FLOORS)) {
    const ran = totals[pkg] ?? 0;
    say(`${pkg}: ${ran} test files (floor ${floor})`);
    if (ran < floor) problems.push(`${pkg} ran ${ran} test files, below its floor of ${floor}`);
  }
  for (const pkg of Object.keys(totals)) {
    if (!(pkg in TEST_FILE_FLOORS)) problems.push(`${pkg} has no floor in test-file-floors.mjs`);
  }
  return problems;
}

const needs = JSON.parse(process.env.NEEDS ?? "{}");
const { classify, ...gated } = needs;
const results = Object.entries(gated).map(([job, need]) => [job, need.result]);
for (const [job, result] of [["classify", classify?.result], ...results]) say(`${job}: ${result}`);

const docsOnly = classify?.outputs?.code === "false";
const jobsPassed =
  classify?.result === "success" &&
  results.length > 0 &&
  results.every(([, result]) => result === "success" || (docsOnly && result === "skipped"));
// Whenever the tests ran, the counts are required; on docs only they were skipped, nothing to count.
const problems = gated.test?.result === "success" ? countProblems(process.env.TEST_FILES_DIR) : [];
for (const problem of problems) say(`::error::${problem}`);

if (!jobsPassed) say("::error::A job the required check gates did not succeed.");
process.exit(jobsPassed && problems.length === 0 ? 0 : 1);
