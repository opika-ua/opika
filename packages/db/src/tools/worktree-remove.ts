import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyProcesses,
  isPathInside,
  killDescription,
  killTree,
  listProcesses,
  normalisePath,
  processesInside,
  type RunningProcess,
} from "./processes";

/**
 * `pnpm worktree:remove <path> [--kill]` (Oleksii, 2026-10-13, accepted
 * with two changes). On Windows `git worktree remove --force` gives up with
 * "Directory not empty": pnpm's junctions and files still held by processes
 * the worktree started (an orphaned `next start`, an esbuild service) stop
 * it. This removes a review worktree properly, and never anything else:
 *
 * 1. Refuses anything that is not a registered worktree of this repo, the
 *    main checkout, a worktree with another worktree inside it, a locked
 *    one, one with uncommitted or untracked changes (no override: that
 *    would be Oleksii's call), a path that is itself a link, and the
 *    worktree you are standing in.
 * 2. Lists processes running from inside it and exits non-zero. Ends them
 *    only with `--kill`, and only those whose program is inside it, by PID;
 *    a process that merely mentions the folder (an editor) is listed for
 *    you to close, never killed.
 * 3. Deletes the real folder with `fs.rm` (retries on EBUSY/EPERM; removes
 *    pnpm's junctions without following them).
 * 4. `git worktree prune`, so git forgets it; skipped if the delete failed.
 */

export type Worktree = { path: string; main: boolean; locked: boolean };

/** `git worktree list --porcelain`: the first entry is the main checkout; `locked` may carry a reason. */
export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .filter((lines) => lines.some((line) => line.startsWith("worktree ")))
    .map((lines, index) => ({
      path: (lines.find((line) => line.startsWith("worktree ")) ?? "").slice("worktree ".length),
      main: index === 0,
      locked: lines.some((line) => line === "locked" || line.startsWith("locked ")),
    }));
}

/** What `git status --porcelain` said about the worktree's files. */
export type WorkingTreeState =
  | { kind: "clean" }
  | { kind: "dirty"; entries: number }
  | { kind: "unreadable" };

export type RemovalPlan =
  | { kind: "refuse"; reason: string }
  | { kind: "blocked"; owned: RunningProcess[]; mentioning: RunningProcess[] }
  | { kind: "remove"; kill: RunningProcess[] };

/** The decision, pure: which worktree, its state, which processes, whether `--kill` was given. */
export function planRemoval(input: {
  target: string;
  /** Where the command was run from: never inside the worktree being deleted. */
  from: string;
  /** The path given is itself a junction or symlink (refused, never followed). */
  targetIsLink: boolean;
  worktrees: readonly Worktree[];
  state: WorkingTreeState;
  owned: readonly RunningProcess[];
  mentioning: readonly RunningProcess[];
  kill: boolean;
  windows: boolean;
}): RemovalPlan {
  const same = (a: string, b: string) =>
    normalisePath(a, input.windows) === normalisePath(b, input.windows);
  if (input.targetIsLink) {
    return {
      kind: "refuse",
      reason:
        "the path is a junction or symlink; pass the worktree's real path, links are never followed",
    };
  }
  const match = input.worktrees.find((w) => same(w.path, input.target));
  if (match === undefined) {
    return { kind: "refuse", reason: "not a registered worktree of this repo (git worktree list)" };
  }
  if (match.main) {
    return { kind: "refuse", reason: "that is the main checkout; never removed by this tool" };
  }
  const nested = input.worktrees.find(
    (w) => !same(w.path, match.path) && isPathInside(w.path, match.path, input.windows),
  );
  if (nested !== undefined) {
    return {
      kind: "refuse",
      reason: `another worktree is inside it (${nested.path}); remove that first`,
    };
  }
  if (match.locked) {
    return { kind: "refuse", reason: "it is locked (git worktree unlock it first if you mean it)" };
  }
  if (input.state.kind === "unreadable") {
    return {
      kind: "refuse",
      reason: "git status could not read it, so its changes can't be checked",
    };
  }
  if (input.state.kind === "dirty") {
    return {
      kind: "refuse",
      reason: `it has ${input.state.entries} uncommitted or untracked change(s); commit, stash or delete them yourself (this tool has no override)`,
    };
  }
  if (isPathInside(input.from, match.path, input.windows)) {
    return { kind: "refuse", reason: "you are inside it; run this from another checkout" };
  }
  // A process that only mentions the folder is never ours to end, so it blocks even with --kill.
  if (input.mentioning.length > 0 || (input.owned.length > 0 && !input.kill)) {
    return { kind: "blocked", owned: [...input.owned], mentioning: [...input.mentioning] };
  }
  return { kind: "remove", kill: [...input.owned] };
}

/**
 * One spelling per path: Windows has two for many (`C:\Users\JOHNDO~1` and
 * the long name git reports), and a lookup by the wrong one would refuse a
 * real worktree. Paths that don't exist resolve as given.
 */
const canonical = (path: string): string =>
  existsSync(path) ? realpathSync.native(path) : resolve(path);

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

const git = (args: readonly string[], cwd: string) =>
  spawnSync("git", args, { cwd, encoding: "utf8" });

const stateOf = (dir: string): WorkingTreeState => {
  if (!existsSync(dir)) return { kind: "unreadable" };
  const status = git(["status", "--porcelain", "--untracked-files=all"], dir);
  if (status.status !== 0) return { kind: "unreadable" };
  const entries = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  return entries === 0 ? { kind: "clean" } : { kind: "dirty", entries };
};

const deleteFolder = (path: string) =>
  rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

export async function removeWorktree(
  target: string,
  options: {
    kill: boolean;
    repo: string;
    log: (line: string) => void;
    /** Injected by tests to prove the failure paths; the real ones otherwise. */
    listProcesses?: () => RunningProcess[];
    remove?: (path: string) => Promise<void>;
  },
): Promise<0 | 1> {
  const listed = git(["worktree", "list", "--porcelain"], options.repo);
  if (listed.status !== 0) {
    options.log("REFUSED: git worktree list failed here; run this from inside the repo.");
    return 1;
  }
  const windows = process.platform === "win32";
  const real = canonical(target);
  let all: RunningProcess[];
  try {
    all = (options.listProcesses ?? listProcesses)();
  } catch (error) {
    options.log(`REFUSED: ${(error as Error).message} Nothing removed.`);
    return 1;
  }
  // A process may name the folder by either spelling; both count.
  const seen = new Set<number>();
  const candidates = [target, real]
    .flatMap((spelling) => processesInside(all, spelling, process.pid, windows))
    .filter((p) => !seen.has(p.pid) && seen.add(p.pid));
  const { owned, mentioning } = classifyProcesses(candidates, [target, real], windows);
  const plan = planRemoval({
    target: real,
    from: canonical(options.repo),
    targetIsLink: isLink(target),
    worktrees: parseWorktrees(listed.stdout).map((w) => ({ ...w, path: canonical(w.path) })),
    state: stateOf(real),
    owned,
    mentioning,
    kill: options.kill,
    windows,
  });
  if (plan.kind === "refuse") {
    options.log(`REFUSED: ${target}: ${plan.reason}. Nothing removed.`);
    return 1;
  }
  if (plan.kind === "blocked") {
    if (plan.owned.length > 0) {
      options.log(`${plan.owned.length} process(es) running from inside ${target}:`);
      for (const p of plan.owned) options.log(`  pid ${p.pid}: ${p.command}`);
    }
    if (plan.mentioning.length > 0) {
      options.log(
        `${plan.mentioning.length} process(es) only mention ${target} (an editor opened on it, say); close them by hand, --kill never ends them:`,
      );
      for (const p of plan.mentioning) options.log(`  pid ${p.pid}: ${p.command}`);
    }
    options.log(
      plan.mentioning.length > 0
        ? "Nothing removed."
        : "Nothing removed. Stop them yourself, or re-run with --kill to end them.",
    );
    return 1;
  }
  for (const p of plan.kill) {
    options.log(`Killing pid ${p.pid}: ${p.command}`);
    options.log(`  ${killDescription(p.pid, killTree(p.pid))}`);
  }
  try {
    await (options.remove ?? deleteFolder)(real);
  } catch (error) {
    // No prune: the folder (or part of it) is still there, and git should keep knowing it.
    options.log(
      `FAILED: deleting ${real} failed after retries (${(error as Error).message}). It is still registered with git; close whatever holds its files and re-run.`,
    );
    return 1;
  }
  git(["worktree", "prune"], options.repo);
  if (existsSync(real)) {
    options.log(`FAILED: ${real} still exists after retries; something still holds a file in it.`);
    return 1;
  }
  options.log(`Removed ${real}, and git pruned it.`);
  return 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const raw = args.find((arg) => !arg.startsWith("--"));
  if (raw === undefined) {
    console.error("Usage: pnpm worktree:remove <path> [--kill]");
    process.exit(1);
  }
  // pnpm runs this from packages/db; a relative path means the caller's directory.
  const base = process.env.INIT_CWD ?? process.cwd();
  const target = isAbsolute(raw) ? raw : resolve(base, raw);
  const code = await removeWorktree(target, {
    kill: args.includes("--kill"),
    repo: base,
    log: (line) => console.log(line),
  });
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
