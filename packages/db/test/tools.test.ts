import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { harnessPort } from "../src/test-utils/test-database";
import { harnessOrphans } from "../src/tools/harness-orphans";
import {
  classifyProcesses,
  isPathInside,
  killDescription,
  listProcesses,
  parsePsProcesses,
  parseWindowsProcesses,
  processesInside,
  programPaths,
  type RunningProcess,
} from "../src/tools/processes";
import { parseWorktrees, planRemoval, removeWorktree } from "../src/tools/worktree-remove";

/**
 * The repo tools (Oleksii, 2026-10-13): worktree:remove lists before it
 * kills, ends only what runs from inside the worktree, and refuses anything
 * but a clean, unlocked, registered, non-main worktree with nothing nested
 * in it; the harness's orphan check finds a server it started; each
 * checkout gets its own harness port.
 */

const proc = (pid: number, parentPid: number, command: string): RunningProcess => ({
  pid,
  parentPid,
  command,
});

describe("process listing", () => {
  it("reads PowerShell's JSON, single object or array, skipping processes with no command line", () => {
    expect(
      parseWindowsProcesses(
        JSON.stringify({ ProcessId: 4, ParentProcessId: 0, CommandLine: "a b" }),
      ),
    ).toEqual([proc(4, 0, "a b")]);
    expect(
      parseWindowsProcesses(
        JSON.stringify([
          { ProcessId: 4, ParentProcessId: 0, CommandLine: null },
          { ProcessId: 5, ParentProcessId: 4, CommandLine: "x" },
        ]),
      ),
    ).toEqual([proc(5, 4, "x")]);
  });

  it("reads PowerShell's JSON even when a command line carries a raw control character", () => {
    const raw = `[{"ProcessId":6,"ParentProcessId":1,"CommandLine":"tool${String.fromCharCode(7)}x"}]`;
    expect(() => JSON.parse(raw)).toThrow();
    expect(parseWindowsProcesses(raw)).toEqual([proc(6, 1, "tool x")]);
  });

  it("reads ps output", () => {
    expect(
      parsePsProcesses(
        "  12     1 Ss   node /repo/a.js\n  13    12 Sl   next start --port 3100\n  14    12 Z    [node] <defunct>\n",
      ),
    ).toEqual([proc(12, 1, "node /repo/a.js"), proc(13, 12, "next start --port 3100")]);
  });

  /**
   * Finding 5: a listing that fails must fail the caller, never read as
   * "nothing running". The failing runs still carry plausible output, so it
   * is the status and error check that refuses them, not an empty parse.
   */
  const plausible =
    process.platform === "win32"
      ? JSON.stringify([{ ProcessId: 4, ParentProcessId: 0, CommandLine: "partial" }])
      : "  4     0 S    partial\n";
  it.each([
    ["exits non-zero", { status: 1, stdout: plausible }],
    [
      "could not start or timed out",
      { status: null, error: new Error("spawnSync ETIMEDOUT"), stdout: plausible },
    ],
    ["returns no processes", { status: 0, stdout: "" }],
  ])("throws when the listing %s", (_what, result) => {
    expect(() => listProcesses(() => result)).toThrow(/Could not list processes/);
  });

  it("returns the processes when the listing succeeds", () => {
    expect(listProcesses(() => ({ status: 0, stdout: plausible }))).toEqual([
      proc(4, 0, "partial"),
    ]);
  });
});

describe("processesInside", () => {
  const all = [
    proc(1, 0, "explorer.exe"),
    proc(10, 1, 'node "D:\\Work\\Review\\node_modules\\.bin\\next" start'),
    proc(11, 1, "node D:/Work/Review2/server.js"),
    proc(20, 1, "pnpm worktree:remove D:\\Work\\Review"),
    proc(21, 20, "node D:\\Work\\Review\\packages\\db\\tool.js"),
  ];

  it("matches by path inside the directory, case-insensitively on Windows, never a sibling with the same prefix", () => {
    expect(processesInside(all, "d:/work/review", 999, true).map((p) => p.pid)).toEqual([
      10, 20, 21,
    ]);
  });

  /**
   * Both rule sets, whichever OS runs the test: Windows paths by win32 rules
   * above, POSIX paths by POSIX rules here. Resolving with the host's rules
   * made the Windows cases fail on Linux CI, and these fail on Windows.
   */
  it("matches POSIX paths by POSIX rules, case-sensitively, on any host", () => {
    const posixAll = [
      proc(10, 1, "node /home/ci/repo/node_modules/.bin/next start"),
      proc(11, 1, "node /home/ci/repo2/server.js"),
      proc(12, 1, "node /home/ci/Repo/other.js"),
    ];
    expect(processesInside(posixAll, "/home/ci/repo", 999, false).map((p) => p.pid)).toEqual([10]);
  });

  it("never lists the asking process or its ancestors", () => {
    expect(processesInside(all, "D:/Work/Review", 21, true).map((p) => p.pid)).toEqual([10]);
  });

  it("compares paths as paths: inside, itself, never a prefix-sharing sibling", () => {
    expect(isPathInside("D:/Work/Review/a", "d:/work/review", true)).toBe(true);
    expect(isPathInside("D:/Work/Review", "D:/Work/Review/", true)).toBe(true);
    expect(isPathInside("D:/Work/Review2", "D:/Work/Review", true)).toBe(false);
  });
});

/** Finding 4: --kill ends what runs from inside; what only mentions the folder is never killed. */
describe("classifyProcesses", () => {
  const wt = "D:/Work/Review";

  it("reads the program as the executable, or the script an interpreter runs", () => {
    expect(programPaths('node "D:\\Work\\Review\\busy.cjs"')).toEqual([
      "node",
      "D:\\Work\\Review\\busy.cjs",
    ]);
    expect(programPaths('"C:\\Program Files\\VS Code\\Code.exe" D:\\Work\\Review')).toEqual([
      "C:\\Program Files\\VS Code\\Code.exe",
    ]);
  });

  it("owns a script or binary inside the worktree; an editor opened on it only mentions it", () => {
    const owned = proc(10, 1, 'node "D:\\Work\\Review\\node_modules\\next\\dist\\bin\\next" start');
    const binary = proc(11, 1, "D:\\Work\\Review\\node_modules\\esbuild\\esbuild.exe --service");
    const editor = proc(12, 1, '"C:\\Program Files\\VS Code\\Code.exe" D:\\Work\\Review');
    const inline = proc(13, 1, 'node -e "setInterval(()=>{},1000)" D:\\Work\\Review');
    expect(classifyProcesses([owned, binary, editor, inline], [wt], true)).toEqual({
      owned: [owned, binary],
      mentioning: [editor, inline],
    });
  });
});

describe("harnessOrphans", () => {
  it("finds a next start on this checkout's port, from inside this checkout, and nothing else", () => {
    const next = (root: string, port: number) =>
      `node "${root}\\node_modules\\next\\dist\\bin\\next" "start" "--port" "${port}"`;
    const all = [
      proc(10, 1, next("D:\\Work\\Repo", 3321)),
      proc(11, 1, next("D:\\Work\\Repo", 3999)),
      proc(12, 1, next("D:\\Other", 3321)),
      proc(13, 1, 'node "D:\\Work\\Repo\\node_modules\\vitest\\vitest.mjs" run'),
    ];
    expect(harnessOrphans(all, "D:/Work/Repo", 3321, 999, true).map((p) => p.pid)).toEqual([10]);
  });
});

describe("harnessPort", () => {
  it("gives two checkouts two ports, both in 3100-3599, stable per checkout", () => {
    const a = harnessPort("D:/Startup/opika");
    const b = harnessPort("D:/opika-worktrees/registry-review");
    expect(a).not.toBe(b);
    for (const port of [a, b]) {
      expect(port).toBeGreaterThanOrEqual(3100);
      expect(port).toBeLessThan(3600);
    }
    expect(harnessPort("D:/Startup/opika")).toBe(a);
  });
});

/** Finding 9: the log never claims a group or tree kill that didn't happen. */
describe("killDescription", () => {
  it("says only what was reached", () => {
    expect(killDescription(7, "tree")).toBe("Ended pid 7 and its process tree.");
    expect(killDescription(7, "group")).toBe("Ended pid 7's process group.");
    expect(killDescription(7, "pid")).toBe(
      "Ended pid 7 only: it leads no process group, so its children may still be running.",
    );
  });
});

describe("planRemoval", () => {
  const worktrees = parseWorktrees(
    [
      "worktree D:/Startup/opika",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree D:/opika-worktrees/review",
      "HEAD def",
      "branch refs/heads/review",
      "",
      "worktree D:/opika-worktrees/review/inner",
      "HEAD fed",
      "branch refs/heads/inner",
      "",
      "worktree D:/opika-worktrees/kept",
      "HEAD 123",
      "branch refs/heads/kept",
      "locked keeping it",
      "",
    ].join("\n"),
  );
  const base = {
    from: "D:/Startup/opika",
    targetIsLink: false,
    worktrees,
    state: { kind: "clean" } as const,
    owned: [],
    mentioning: [],
    windows: true,
    kill: false,
  };
  const inner = "D:/opika-worktrees/review/inner";

  it("parses the porcelain list: the main checkout first, locked worktrees marked", () => {
    expect(worktrees).toEqual([
      { path: "D:/Startup/opika", main: true, locked: false },
      { path: "D:/opika-worktrees/review", main: false, locked: false },
      { path: inner, main: false, locked: false },
      { path: "D:/opika-worktrees/kept", main: false, locked: true },
    ]);
  });

  it("refuses an unregistered path, the main checkout, and a worktree you are standing in", () => {
    expect(planRemoval({ ...base, target: "D:/opika-worktrees/other" }).kind).toBe("refuse");
    // From outside it, so the main-checkout rule is what refuses (not "you are inside it").
    expect(planRemoval({ ...base, target: "d:/startup/opika", from: "D:/elsewhere" })).toEqual({
      kind: "refuse",
      reason: "that is the main checkout; never removed by this tool",
    });
    expect(planRemoval({ ...base, target: inner, from: `${inner}/packages/db` })).toEqual({
      kind: "refuse",
      reason: "you are inside it; run this from another checkout",
    });
  });

  /** Findings 1–3: never delete work, a nested worktree, or through a link. */
  it("refuses a worktree holding another, a locked one, a dirty or unreadable one, and a link", () => {
    expect(planRemoval({ ...base, target: "D:/opika-worktrees/review" })).toEqual({
      kind: "refuse",
      reason: `another worktree is inside it (${inner}); remove that first`,
    });
    expect(planRemoval({ ...base, target: "D:/opika-worktrees/kept" }).kind).toBe("refuse");
    expect(planRemoval({ ...base, target: inner, state: { kind: "dirty", entries: 2 } })).toEqual({
      kind: "refuse",
      reason:
        "it has 2 uncommitted or untracked change(s); commit, stash or delete them yourself (this tool has no override)",
    });
    expect(planRemoval({ ...base, target: inner, state: { kind: "unreadable" } }).kind).toBe(
      "refuse",
    );
    expect(planRemoval({ ...base, target: inner, targetIsLink: true }).kind).toBe("refuse");
  });

  it("blocks on processes without --kill, ends only owned ones with it, and never ends a mention", () => {
    const owned = [proc(10, 1, `node ${inner}/x.js`)];
    const mentioning = [proc(11, 1, `code ${inner}`)];
    expect(planRemoval({ ...base, target: inner, owned })).toEqual({
      kind: "blocked",
      owned,
      mentioning: [],
    });
    expect(planRemoval({ ...base, target: inner, owned, kill: true })).toEqual({
      kind: "remove",
      kill: owned,
    });
    expect(planRemoval({ ...base, target: inner, owned, mentioning, kill: true })).toEqual({
      kind: "blocked",
      owned,
      mentioning,
    });
    expect(planRemoval({ ...base, target: inner })).toEqual({ kind: "remove", kill: [] });
  });
});

describe("removeWorktree, for real", () => {
  const root = mkdtempSync(join(tmpdir(), "opika-wt-"));
  const repo = join(root, "repo");
  const outside = join(root, "outside");
  const git = (args: string[], cwd = repo) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  mkdirSync(repo);
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "must survive");
  git(["init", "-q"]);
  // Like a real checkout: node_modules ignored, so pnpm's links don't make a worktree "dirty".
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
  writeFileSync(join(repo, "busy.cjs"), "setInterval(() => {}, 1000);\n");
  git(["add", "."]);
  git(["-c", "user.email=t@example.org", "-c", "user.name=t", "commit", "-q", "-m", "init"]);
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const children: ReturnType<typeof spawn>[] = [];
  const listed = () => git(["worktree", "list", "--porcelain"]);
  const addWorktree = (name: string) => {
    const wt = join(root, name);
    git(["worktree", "add", "-q", wt]);
    return wt;
  };
  const startProcess = async (args: string[]) => {
    const child = spawn(process.execPath, args, { stdio: "ignore" });
    children.push(child);
    for (let i = 0; i < 50 && !listProcesses().some((p) => p.pid === child.pid); i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return child.pid;
  };

  afterAll(async () => {
    for (const child of children) child.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  it("removes a worktree whose node_modules holds a junction, without touching the junction's target", async () => {
    const wt = addWorktree("wt-junction");
    mkdirSync(join(wt, "node_modules"));
    symlinkSync(outside, join(wt, "node_modules", "linked"), "junction");
    expect(await removeWorktree(wt, { kill: false, repo, log })).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    expect(listed()).not.toContain("wt-junction");
  });

  it("refuses while a process runs from inside it, then removes it with --kill and the process is gone", async () => {
    const wt = addWorktree("wt-busy");
    const pid = await startProcess([join(wt, "busy.cjs")]);
    expect(await removeWorktree(wt, { kill: false, repo, log })).toBe(1);
    expect(existsSync(wt)).toBe(true);
    expect(lines.some((line) => line.includes(`pid ${pid}`))).toBe(true);
    expect(await removeWorktree(wt, { kill: true, repo, log })).toBe(0);
    expect(existsSync(wt)).toBe(false);
    // The kill is immediate; the OS listing catches up within moments.
    let stillListed = true;
    for (let i = 0; i < 50 && stillListed; i += 1) {
      stillListed = listProcesses().some((p) => p.pid === pid);
      if (stillListed) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(stillListed).toBe(false);
  }, 60_000);

  it("never ends a process that only mentions it, even with --kill", async () => {
    const wt = addWorktree("wt-mentioned");
    const pid = await startProcess(["-e", "setInterval(() => {}, 1000)", wt]);
    expect(await removeWorktree(wt, { kill: true, repo, log })).toBe(1);
    expect(existsSync(wt)).toBe(true);
    expect(lines.at(-1)).toBe("Nothing removed.");
    expect(listProcesses().some((p) => p.pid === pid)).toBe(true);
  }, 60_000);

  it("refuses a worktree with untracked work, leaving the work where it is", async () => {
    const wt = addWorktree("wt-dirty");
    writeFileSync(join(wt, "notes.txt"), "unsaved thinking");
    expect(await removeWorktree(wt, { kill: true, repo, log })).toBe(1);
    expect(lines.at(-1)).toMatch(/uncommitted or untracked/);
    expect(existsSync(join(wt, "notes.txt"))).toBe(true);
  });

  it("refuses a locked worktree", async () => {
    const wt = addWorktree("wt-locked");
    git(["worktree", "lock", wt]);
    expect(await removeWorktree(wt, { kill: true, repo, log })).toBe(1);
    expect(lines.at(-1)).toMatch(/locked/);
    expect(existsSync(wt)).toBe(true);
  });

  it("refuses a worktree with another worktree nested inside it", async () => {
    const outer = addWorktree("wt-outer");
    const inner = join(outer, "inner");
    git(["worktree", "add", "-q", inner]);
    // The outer one's status ignores the nested checkout's files only if git does; the nesting rule must refuse first.
    expect(await removeWorktree(outer, { kill: true, repo, log })).toBe(1);
    expect(lines.at(-1)).toMatch(/another worktree is inside it/);
    expect(existsSync(join(inner, "busy.cjs"))).toBe(true);
  });

  it("refuses a junction pointing at a worktree, deleting neither", async () => {
    const wt = addWorktree("wt-real");
    const link = join(root, "wt-link");
    symlinkSync(wt, link, "junction");
    expect(await removeWorktree(link, { kill: true, repo, log })).toBe(1);
    expect(lines.at(-1)).toMatch(/junction or symlink/);
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(link)).toBe(true);
    expect(listed()).toContain("wt-real");
  });

  it("refuses when processes can't be listed, removing nothing", async () => {
    const wt = addWorktree("wt-unlisted");
    const failing = () => {
      throw new Error("Could not list processes (powershell exited 1); refusing to guess.");
    };
    expect(await removeWorktree(wt, { kill: true, repo, log, listProcesses: failing })).toBe(1);
    expect(lines.at(-1)).toMatch(/Could not list processes/);
    expect(existsSync(wt)).toBe(true);
  });

  /** Finding 6: a delete that still fails after its retries is reported, and git keeps the worktree. */
  it("reports FAILED, without pruning, when the delete fails after its retries", async () => {
    const wt = addWorktree("wt-stuck");
    const stuck = async () => {
      throw new Error("EBUSY: resource busy or locked");
    };
    expect(await removeWorktree(wt, { kill: false, repo, log, remove: stuck })).toBe(1);
    expect(lines.at(-1)).toMatch(/^FAILED: .*EBUSY.*still registered/);
    expect(listed()).toContain("wt-stuck");
  });

  it("refuses the main checkout, even run from a worktree of it", async () => {
    const from = addWorktree("wt-from");
    expect(await removeWorktree(repo, { kill: true, repo: from, log })).toBe(1);
    expect(lines.at(-1)).toMatch(/main checkout/);
    expect(existsSync(repo)).toBe(true);
  });
});

/**
 * Finding 7: arguments reach Playwright as given. Through a shell,
 * `--grep "keyboard focus"` was re-split into two words. (The grep is now
 * "keyboard reachability": the harness's "keyboard focus" blocks were renamed
 * when their focus-ring measurements were removed, 2026-10-20.)
 */
describe("the harness wrapper", () => {
  const web = resolve(fileURLToPath(import.meta.url), "../../../../apps/web");
  const total = (out: string) => Number(out.match(/Total: (\d+) tests?/)?.[1] ?? Number.NaN);

  it("forwards a quoted, two-word --grep exactly as Playwright receives it directly", () => {
    const cli = require.resolve("@playwright/test/cli", { paths: [web] });
    const direct = spawnSync(
      process.execPath,
      [cli, "test", "--list", "--grep", "keyboard reachability"],
      {
        cwd: web,
        encoding: "utf8",
      },
    );
    const wrapped = spawnSync(
      process.execPath,
      ["test/run-harness.mjs", "--list", "--grep", "keyboard reachability"],
      { cwd: web, encoding: "utf8" },
    );
    const expected = total(direct.stdout);
    expect(expected).toBeGreaterThan(0);
    expect(total(wrapped.stdout)).toBe(expected);
  }, 120_000);
});
