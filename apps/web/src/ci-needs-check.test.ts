import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * CI's docs-only skip (Oleksii, 2026-10-19, verbatim: "Docs-only: use paths-ignore for docs-only
 * changes (docs/**, **\/*.md, except anything under packages/i18n). A required check skipped this
 * way must still report success, so branch protection doesn't block docs PRs."). A wrong `false`
 * would merge code without the suite, so the classifier is driven exactly as the workflow drives
 * it: paths on stdin, `true`/`false` on stdout.
 */
const REPO = resolve(fileURLToPath(import.meta.url), "../../../..");
const SCRIPT = resolve(REPO, ".github/scripts/needs-check.mjs");

const needsCheck = (paths: readonly string[]): string => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: paths.join("\n"),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
};

describe("needs-check: which pull requests skip the full check", () => {
  it.each([
    ["a doc under docs/", ["docs/build-plan.md"]],
    ["a design asset under docs/design/", ["docs/design/frame.png"]],
    ["Markdown outside the code trees", ["CLAUDE.md", "README.md", ".claude/agents/reviewer.md"]],
    ["several docs together", ["docs/a.md", ".claude/commands/phase.md"]],
  ])("documentation only, skipped: %s", (_name, paths) => {
    expect(needsCheck(paths)).toBe("false");
  });

  it.each([
    ["code", ["apps/web/src/proxy.ts"]],
    ["code beside docs", ["docs/build-plan.md", "packages/db/src/prod-guard.ts"]],
    ["the copy catalogues", ["packages/i18n/src/messages/uk.ts"]],
    ["Markdown under packages/i18n", ["packages/i18n/NOTES.md"]],
    // allowlist-removed.test.ts scans every .md under apps/ and packages/.
    ["Markdown anywhere under packages/", ["packages/db/README.md"]],
    ["Markdown anywhere under apps/", ["apps/web/src/app/fonts/brand-ui/README.md"]],
    ["a served file under apps/web/public", ["apps/web/public/seed-photos/SOURCES.md"]],
    // biome lints docs/ outside docs/design.
    ["a non-Markdown file under docs/, outside docs/design", ["docs/proposal.json"]],
    ["the workflow itself", [".github/workflows/ci.yml"]],
    ["a name that only contains .md", ["src/md.ts", "docs.ts"]],
    ["no paths at all", []],
    ["blank lines only", ["", "  "]],
  ])("runs the check: %s", (_name, paths) => {
    expect(needsCheck(paths)).toBe("true");
  });
});

/**
 * The required `check`'s gate, driven as the workflow drives it: the `needs` context as JSON in
 * $NEEDS, exit 0 or not. A skipped required check counts as passing, so every non-success has to
 * fail here, except the gated jobs skipped on a documentation-only change.
 */
const GATE = resolve(REPO, ".github/scripts/check-gate.mjs");
type Result = "success" | "failure" | "cancelled" | "skipped";
const gate = (classify: Result, code: string, build: Result, test: Result): number | null =>
  spawnSync(process.execPath, [GATE], {
    env: {
      ...process.env,
      NEEDS: JSON.stringify({
        classify: { result: classify, outputs: classify === "success" ? { code } : {} },
        build: { result: build, outputs: {} },
        test: { result: test, outputs: {} },
      }),
    },
    encoding: "utf8",
  }).status;

describe("check-gate: when the required check passes", () => {
  it.each([
    ["every job succeeded", "success", "true", "success", "success"],
    ["documentation only, the gated jobs skipped", "success", "false", "skipped", "skipped"],
    ["an empty classification that ran everything", "success", "", "success", "success"],
  ] as const)("passes: %s", (_name, classify, code, build, test) => {
    expect(gate(classify, code, build, test)).toBe(0);
  });

  it.each([
    ["a shard failed", "success", "true", "success", "failure"],
    ["the build job failed", "success", "true", "failure", "success"],
    ["a cancelled run", "success", "true", "cancelled", "cancelled"],
    ["jobs skipped on code", "success", "true", "skipped", "skipped"],
    ["jobs skipped after an empty classification", "success", "", "skipped", "skipped"],
    ["the classification failed", "failure", "", "skipped", "skipped"],
    ["the classification was cancelled", "cancelled", "", "skipped", "skipped"],
    ["documentation only, but a gated job failed", "success", "false", "failure", "skipped"],
  ] as const)("fails: %s", (_name, classify, code, build, test) => {
    expect(gate(classify, code, build, test)).toBe(1);
  });

  it("fails with no needs at all", () => {
    expect(
      spawnSync(process.execPath, [GATE], { env: { ...process.env, NEEDS: "{}" } }).status,
    ).toBe(1);
  });
});

/**
 * The wiring: `classify` decides, `build` and the test shards skip on documentation only, and
 * `check` (the ruleset's required check) runs always and gates every other job.
 */
describe("ci.yml", () => {
  const workflow = readFileSync(resolve(REPO, ".github/workflows/ci.yml"), "utf8");
  const jobsText = workflow.slice(workflow.indexOf("\njobs:\n"));
  const headers = [...jobsText.matchAll(/^ {2}([a-z0-9_-]+):\s*$/gm)];
  const jobs = new Map(
    headers.map((match, i) => [match[1], jobsText.slice(match.index, headers[i + 1]?.index)]),
  );

  it("has the classifier, the build, the test shards and the required `check`", () => {
    expect([...jobs.keys()]).toEqual(["classify", "build", "test", "check"]);
  });

  it("skips only the build and the shards, and only on documentation only", () => {
    for (const name of ["build", "test"]) {
      expect(jobs.get(name)).toMatch(/^ {4}needs: classify$/m);
      expect(jobs.get(name)).toMatch(/^ {4}if: needs\.classify\.outputs\.code != 'false'$/m);
    }
    expect(jobs.get("classify")).not.toMatch(/^ {4}(needs|if):/m);
  });

  it("runs `check` always, after every other job, through the gate", () => {
    const check = jobs.get("check") ?? "";
    expect(check).toMatch(/^ {4}if: always\(\)$/m);
    expect(check).toMatch(/^ {4}needs: \[classify, build, test\]$/m);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
    expect(check).toContain("NEEDS: ${{ toJSON(needs) }}");
    expect(check).toContain("node .github/scripts/check-gate.mjs");
  });

  it("splits the suite into three shards that all run", () => {
    const test = jobs.get("test") ?? "";
    expect(test).toMatch(/shard: \[1, 2, 3\]/);
    expect(test).toMatch(/fail-fast: false/);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
    expect(test).toContain("pnpm run test --shard=${{ matrix.shard }}/3");
  });

  it("lists a rename's source as well as its destination", () => {
    expect(workflow).toContain('git diff --no-renames --name-only "$BASE...$HEAD"');
  });

  it("cancels superseded runs per pull request, never a run on the default branch", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});
