// `pnpm test:harness`: the Playwright harness, then the orphan check
// (packages/db/src/tools/harness-orphans.ts). The check runs whatever the
// harness's result, because a failing run is the likeliest to leave a server
// behind; the exit code is the worse of the two.
//
// Playwright runs as `node <its cli> test …` with no shell, so forwarded
// arguments reach it as given: through a shell, `--grep "gallery layout"`
// was re-split into two words and matched nothing (review of worktree:remove,
// finding 7). Only the orphan check, which takes no arguments, goes through
// pnpm, and so needs a shell on Windows (`pnpm` is a .cmd there).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");

const harness =
  spawnSync(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    stdio: "inherit",
  }).status ?? 1;
const orphans =
  spawnSync("pnpm", ["--filter", "@opika/db", "exec", "tsx", "src/tools/harness-orphans.ts"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }).status ?? 1;
process.exit(harness !== 0 ? harness : orphans);
