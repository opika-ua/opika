// Lint plus a warning ratchet: the count must equal tooling/biome-warning-baseline.json, so it only goes down.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const baselineUrl = new URL("./biome-warning-baseline.json", import.meta.url);
const args = process.argv.slice(2).filter((a) => a !== "--update");
const update = process.argv.includes("--update");
const targets = args.length > 0 ? args : ["."];

const run = (extra) =>
  spawnSync("pnpm", ["exec", "biome", "check", ...targets, ...extra], {
    shell: true,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["inherit", extra.length > 0 ? "pipe" : "inherit", "inherit"],
  });

// Normal run first: prints diagnostics and fails on errors exactly as before.
const normal = run([]);
if (normal.status !== 0) process.exit(normal.status ?? 1);

const json = run(["--reporter=json", "--max-diagnostics=0"]);
const out = json.stdout ?? "";
const start = out.indexOf('{"summary"');
if (start < 0) {
  process.stderr.write("biome-ratchet: could not find the JSON summary in Biome's output.\n");
  process.exit(1);
}
const { summary } = JSON.parse(
  out.slice(start, out.indexOf("\n", start) < 0 ? undefined : out.indexOf("\n", start)),
);
const count = summary.warnings;

if (update) {
  writeFileSync(baselineUrl, `${JSON.stringify({ warnings: count })}\n`);
  process.stdout.write(`biome-ratchet: baseline set to ${count}.
`);
  process.exit(0);
}

const { warnings: baseline } = JSON.parse(readFileSync(baselineUrl, "utf8"));
if (count === baseline) {
  process.stdout.write(`biome-ratchet: ${count} warnings, matches the baseline.
`);
} else if (count > baseline) {
  process.stderr.write(
    `biome-ratchet: ${count} warnings, baseline is ${baseline}. Fix the new warnings; do not raise the baseline.
`,
  );
  process.exit(1);
} else {
  process.stderr.write(
    `biome-ratchet: ${count} warnings, baseline is ${baseline}. Lower it: pnpm run lint:ratchet-update (commit tooling/biome-warning-baseline.json).
`,
  );
  process.exit(1);
}
