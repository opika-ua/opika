// Run after `next build` (CI does, right after build:web): prints each public route's first-load
// JavaScript and fails if any chunk a public route loads contains zod. The source half of this
// guard is src/client-bundle-guard.test.ts; this one reads what the bundler actually emitted, so
// it also catches a path the source scan cannot see. Kabinet routes ship zod on purpose.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// The email kit (src/kabinet/emails, React Email) renders on the server only: no browser chunk of any route,
// kabinet included, may carry it. Its head's markers survive minification as strings.
const EMAIL_MARKERS = ["x-apple-disable-message-reformatting", "o-mso-head"];
const browserChunks = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return browserChunks(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
const emailLeaks = browserChunks(".next/static").filter((chunk) => {
  const text = readFileSync(chunk, "utf8");
  return EMAIL_MARKERS.some((marker) => text.includes(marker));
});
if (emailLeaks.length > 0) {
  process.stderr.write(`\nthe email kit reached the browser bundle:\n${emailLeaks.join("\n")}\n`);
  process.exit(1);
}
