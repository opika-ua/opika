// Writes {"<package dir>": <test files vitest ran>} for one shard to the path in argv[2], from the
// JSON report each package's `vitest run` wrote. A package with no report is left out, so the
// floor in `check` (test-file-floors.mjs) fails rather than counting it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT = ".vitest-shard.json";
const counts = {};
for (const root of ["apps", "packages"]) {
  for (const name of readdirSync(root)) {
    const report = join(root, name, REPORT);
    if (existsSync(report)) {
      counts[`${root}/${name}`] = JSON.parse(readFileSync(report, "utf8")).testResults.length;
    }
  }
}
process.stdout.write(`${JSON.stringify(counts)}\n`);
writeFileSync(process.argv[2], JSON.stringify(counts));
