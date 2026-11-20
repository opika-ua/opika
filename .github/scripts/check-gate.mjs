// The required `check`: reads the workflow's `needs` (toJSON) from $NEEDS and exits 0 only when
// `classify` succeeded and either the change is documentation only (the gated jobs skipped) or
// every other job succeeded. A skipped required check counts as passing, so a cancelled, failed or
// skipped job must turn into a failure here rather than reach the ruleset as a skip.
const needs = JSON.parse(process.env.NEEDS ?? "{}");
const { classify, ...gated } = needs;
const results = Object.entries(gated).map(([job, need]) => [job, need.result]);
for (const [job, result] of [["classify", classify?.result], ...results]) {
  process.stdout.write(`${job}: ${result}\n`);
}

const docsOnly = classify?.outputs?.code === "false";
const passed =
  classify?.result === "success" &&
  results.length > 0 &&
  results.every(([, result]) => result === "success" || (docsOnly && result === "skipped"));

if (!passed) process.stdout.write("::error::A job the required check gates did not succeed.\n");
process.exit(passed ? 0 : 1);
