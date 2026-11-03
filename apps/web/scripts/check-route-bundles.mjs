// Run after `next build` (CI does, right after build:web): prints each public route's first-load
// JavaScript and fails if any chunk a public route loads contains zod. The source half of this
// guard is src/client-bundle-guard.test.ts; this one reads what the bundler actually emitted, so
// it also catches a path the source scan cannot see. Kabinet routes ship zod on purpose.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const STATS = ".next/diagnostics/route-bundle-stats.json";
// Names zod's classes register under; they survive minification as strings.
const ZOD_MARKERS = ["$ZodType", "$ZodObject", "$ZodString"];
const EXEMPT = [/^\/kabinet/, /^\/dev\//, /^\/api\//];

const routes = JSON.parse(readFileSync(STATS, "utf8"));
const failures = [];
const rows = [];

for (const { route, firstLoadChunkPaths } of routes) {
  if (EXEMPT.some((pattern) => pattern.test(route))) continue;
  let raw = 0;
  let gzip = 0;
  for (const chunk of firstLoadChunkPaths) {
    const bytes = readFileSync(chunk.replaceAll("\\", "/"));
    raw += bytes.length;
    gzip += gzipSync(bytes).length;
    const text = bytes.toString("utf8");
    if (ZOD_MARKERS.some((marker) => text.includes(marker))) failures.push(`${route}: ${chunk}`);
  }
  rows.push(`${route.padEnd(36)} ${String(raw).padStart(9)} raw ${String(gzip).padStart(9)} gzip`);
}

process.stdout.write(`${rows.sort().join("\n")}\n`);
if (failures.length > 0) {
  process.stderr.write(
    `\nzod found in a public route's first-load chunks:\n${failures.join("\n")}\n`,
  );
  process.exit(1);
}
