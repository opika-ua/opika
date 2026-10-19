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
    ["Markdown anywhere under apps/", ["apps/web/src/app/fonts/literata/README.md"]],
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
 * The wiring. The classification is a step inside `check`, so a cancelled run stays cancelled (a
 * job skipped after a cancelled dependency reports success), and every later step is gated on it.
 */
describe("ci.yml", () => {
  const workflow = readFileSync(resolve(REPO, ".github/workflows/ci.yml"), "utf8");
  const steps = workflow
    .slice(workflow.indexOf("id: classify"))
    .split(/\n {6}- /)
    .slice(1);

  it("has one job, `check`, with no job-level skip", () => {
    expect(workflow).toMatch(/^jobs:\n {2}check:\n {4}runs-on: ubuntu-latest\n/m);
    expect(workflow).not.toMatch(/^ {2}[a-z-]+:\n {4}(needs|if):/m);
  });

  it("gates every step after the classification, except the upload that runs only on failure", () => {
    expect(steps.length).toBeGreaterThan(8);
    for (const step of steps) {
      expect(
        step.includes("if: steps.classify.outputs.code != 'false'") ||
          step.includes("if: failure()"),
        step.split("\n")[0],
      ).toBe(true);
    }
  });

  it("lists a rename's source as well as its destination", () => {
    expect(workflow).toContain('git diff --no-renames --name-only "$BASE...$HEAD"');
  });

  it("cancels superseded runs per pull request, never a run on the default branch", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});
