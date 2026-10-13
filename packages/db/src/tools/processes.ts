import { spawnSync } from "node:child_process";
import { basename, isAbsolute, resolve } from "node:path";

/**
 * Processes on this machine, for the two repo tools that must know what is
 * still running inside a checkout: `worktree:remove` (a running process
 * holds files the delete can't remove) and the harness's orphan check (a
 * server the harness started must not outlive it). Matched by the checkout
 * path in the command line, never by process name alone: "node" or "next"
 * names half the machine.
 */
export type RunningProcess = { pid: number; parentPid: number; command: string };

/** The bits of `spawnSync`'s result this module reads, so a test can hand in a failing one. */
type SpawnResult = { status: number | null; error?: Error | undefined; stdout: string };
export type ProcessListRunner = (command: string, args: readonly string[]) => SpawnResult;

const LIST_TIMEOUT_MS = 15_000;

const defaultRunner: ProcessListRunner = (command, args) =>
  spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: LIST_TIMEOUT_MS,
  });

/**
 * Windows: one CIM query as JSON. Elsewhere: `ps`. Both parsed below, both pure.
 *
 * Fails closed (review of worktree:remove, finding 5): if the listing can't
 * run, times out or exits non-zero, this throws rather than answering "no
 * processes", which would let a removal proceed over a running server and
 * turn the harness's orphan check into a false green.
 */
export function listProcesses(run: ProcessListRunner = defaultRunner): RunningProcess[] {
  const [command, args, parse] =
    process.platform === "win32"
      ? ([
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
          ],
          parseWindowsProcesses,
        ] as const)
      : (["ps", ["-eo", "pid=,ppid=,args="], parsePsProcesses] as const);
  const out = run(command, args);
  if (out.error !== undefined || out.status !== 0) {
    throw new Error(
      `Could not list processes (${command} ${out.error?.message ?? `exited ${out.status}`}); refusing to guess that none are running.`,
    );
  }
  const processes = parse(out.stdout);
  if (processes.length === 0) {
    throw new Error(`Could not list processes (${command} returned none); refusing to guess.`);
  }
  return processes;
}

export function parseWindowsProcesses(json: string): RunningProcess[] {
  if (json.trim() === "") return [];
  // PowerShell emits some processes' command lines with raw control
  // characters, which JSON.parse rejects; as spaces they parse, and a command
  // line loses nothing a path match needs (found running this on a real machine).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: replacing them is the point
  const parsed = JSON.parse(json.replace(/[\u0000-\u001f]/g, " ")) as
    | { ProcessId: number; ParentProcessId: number; CommandLine: string | null }
    | { ProcessId: number; ParentProcessId: number; CommandLine: string | null }[];
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter((p) => p.CommandLine !== null)
    .map((p) => ({ pid: p.ProcessId, parentPid: p.ParentProcessId, command: p.CommandLine ?? "" }));
}

export function parsePsProcesses(text: string): RunningProcess[] {
  return text
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), parentPid: Number(m[2]), command: m[3] ?? "" }));
}

/**
 * One spelling for comparing paths: forward slashes, no trailing slash, and
 * case-insensitive on Windows (one path, many spellings). Shared by every
 * path comparison in these tools, so they can't disagree.
 */
export const normalisePath = (path: string, windows: boolean): string => {
  const forward = resolve(path).replaceAll("\\", "/").replace(/\/+$/, "");
  return windows ? forward.toLowerCase() : forward;
};

/** `path` is `dir` itself or anywhere under it (never a sibling sharing its prefix). */
export const isPathInside = (path: string, dir: string, windows: boolean): boolean =>
  `${normalisePath(path, windows)}/`.startsWith(`${normalisePath(dir, windows)}/`);

/** The asking process and its ancestors: they run from inside the checkout too, and are never listed or killed. */
const ancestryOf = (all: readonly RunningProcess[], self: number): Set<number> => {
  const byPid = new Map(all.map((p) => [p.pid, p]));
  const ancestry = new Set<number>();
  for (let pid: number | undefined = self; pid !== undefined && !ancestry.has(pid); ) {
    ancestry.add(pid);
    pid = byPid.get(pid)?.parentPid;
  }
  return ancestry;
};

/** The processes whose command line mentions a path inside `dir`, minus `self` and its ancestors. */
export function processesInside(
  all: readonly RunningProcess[],
  dir: string,
  self: number,
  windows = process.platform === "win32",
): RunningProcess[] {
  const root = normalisePath(dir, windows);
  const ancestry = ancestryOf(all, self);
  return all.filter((p) => {
    if (ancestry.has(p.pid)) return false;
    const command = (windows ? p.command.toLowerCase() : p.command).replaceAll("\\", "/");
    return (
      command.includes(`${root}/`) ||
      command.endsWith(root) ||
      command.includes(`${root} `) ||
      command.includes(`${root}"`)
    );
  });
}

/** A command line split into arguments, honouring double quotes (Windows and POSIX alike for this purpose). */
export const commandTokens = (command: string): string[] =>
  [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? "");

/** Interpreters whose program is the script they're handed, not themselves. */
const INTERPRETERS = new Set(["node", "bun", "deno", "python", "python3", "pythonw"]);

/**
 * The paths that make up the running program: the executable, and for an
 * interpreter the script it runs (its first argument that isn't a flag).
 * What the process *is*, as opposed to what it merely mentions.
 */
export function programPaths(command: string): string[] {
  const [executable, ...rest] = commandTokens(command);
  if (executable === undefined) return [];
  const name = basename(executable.replaceAll("\\", "/"))
    .toLowerCase()
    .replace(/\.exe$/, "");
  if (!INTERPRETERS.has(name)) return [executable];
  const script = rest.find((token) => !token.startsWith("-"));
  return script === undefined ? [executable] : [executable, script];
}

/**
 * Split what runs from inside `dir` (its executable or script is there:
 * safe to end) from what only mentions it as an argument (an editor opened
 * on the folder: ending its tree would close unrelated work, review of
 * worktree:remove finding 4). Relative paths can't be placed, so they never
 * count as owned. `dirs` is every spelling of the one folder (Windows has a
 * short and a long name for many), and inside any of them counts.
 */
export function classifyProcesses(
  candidates: readonly RunningProcess[],
  dirs: readonly string[],
  windows = process.platform === "win32",
): { owned: RunningProcess[]; mentioning: RunningProcess[] } {
  const owned: RunningProcess[] = [];
  const mentioning: RunningProcess[] = [];
  for (const p of candidates) {
    const runsFromInside = programPaths(p.command).some(
      (path) => isAbsolute(path) && dirs.some((dir) => isPathInside(path, dir, windows)),
    );
    (runsFromInside ? owned : mentioning).push(p);
  }
  return { owned, mentioning };
}

/** What a kill actually reached, so the log never claims more than happened (finding 9). */
export type KillResult = "tree" | "group" | "pid" | "gone";

/**
 * Ends a process and what it started. Windows: `taskkill /T`, the whole tree.
 * Elsewhere: the process group when the pid leads one; otherwise only that
 * pid, since a group kill reaches only groups the pid leads and its children
 * may live on.
 */
export function killTree(pid: number): KillResult {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return "tree";
  }
  try {
    process.kill(-pid, "SIGKILL");
    return "group";
  } catch {
    try {
      process.kill(pid, "SIGKILL");
      return "pid";
    } catch {
      return "gone";
    }
  }
}

export function killDescription(pid: number, result: KillResult): string {
  switch (result) {
    case "tree":
      return `Ended pid ${pid} and its process tree.`;
    case "group":
      return `Ended pid ${pid}'s process group.`;
    case "pid":
      return `Ended pid ${pid} only: it leads no process group, so its children may still be running.`;
    case "gone":
      return `pid ${pid} had already exited.`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled result; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}
