import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT_ROOT, harnessPort } from "../test-utils/test-database";
import { listProcesses, processesInside, type RunningProcess } from "./processes";

/**
 * Run after every harness run (`apps/web/test/run-harness.mjs`), for
 * Oleksii's "no process the harness started outlives teardown" (2026-10-13).
 * What it checks, exactly: a `next start` on this checkout's harness port,
 * launched from inside this checkout, still running after the run. That is
 * the server Playwright's webServer starts; its teardown already ends the
 * server's whole tree (`taskkill /T` on Windows, the process group
 * elsewhere), so this is the test that it did. Other processes the harness
 * may start (the browser, build workers) are Playwright's own and are not
 * checked here.
 *
 * (The one orphan seen so far came from killing the test runner itself
 * mid-run, which no teardown can cover; this check makes the next run say
 * so plainly instead of failing on "port already used". A failure to list
 * processes fails the check rather than passing it.)
 */
export function harnessOrphans(
  all: readonly RunningProcess[],
  checkoutRoot: string,
  port: number,
  self: number,
  windows = process.platform === "win32",
): RunningProcess[] {
  const startOnPort = new RegExp(`\\bnext\\b.*\\bstart\\b.*\\b${port}\\b`, "i");
  return processesInside(all, checkoutRoot, self, windows).filter((p) =>
    startOnPort.test(p.command),
  );
}

function main(): void {
  const port = harnessPort();
  let all: RunningProcess[];
  try {
    all = listProcesses();
  } catch (error) {
    console.error(`harness: ${(error as Error).message}`);
    process.exit(1);
  }
  const orphans = harnessOrphans(all, CHECKOUT_ROOT, port, process.pid);
  if (orphans.length === 0) {
    console.log(`harness: no process outlived the run (port ${port}).`);
    process.exit(0);
  }
  console.error(`harness: ${orphans.length} process(es) the harness started are still running:`);
  for (const p of orphans) console.error(`  pid ${p.pid}: ${p.command}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
