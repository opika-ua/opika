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
    ["a non-Markdown file under docs/", ["docs/design/frame.png"]],
    ["Markdown anywhere else", ["CLAUDE.md", "README.md", ".claude/agents/reviewer.md"]],
    ["several docs together", ["docs/a.md", "apps/web/src/app/fonts/literata/README.md"]],
  ])("documentation only, skipped: %s", (_name, paths) => {
    expect(needsCheck(paths)).toBe("false");
  });

  it.each([
    ["code", ["apps/web/src/proxy.ts"]],
    ["code beside docs", ["docs/build-plan.md", "packages/db/src/prod-guard.ts"]],
    ["the copy catalogues, Markdown included", ["packages/i18n/src/messages/uk.ts"]],
    ["Markdown under packages/i18n", ["packages/i18n/NOTES.md"]],
    [
      "a served file under apps/web/public (a test reads SOURCES.md)",
      ["apps/web/public/seed-photos/SOURCES.md"],
    ],
    ["the workflow itself", [".github/workflows/ci.yml"]],
    ["a name that only contains .md", ["apps/web/src/md.ts", "docs.ts"]],
    ["no paths at all", []],
    ["blank lines only", ["", "  "]],
  ])("runs the check: %s", (_name, paths) => {
    expect(needsCheck(paths)).toBe("true");
  });
});

/** The workflow wires it so that a classifier failure runs the suite rather than skipping it. */
describe("ci.yml", () => {
  const workflow = readFileSync(resolve(REPO, ".github/workflows/ci.yml"), "utf8");

  it("skips `check` only on an explicit `false` from a successful classification", () => {
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
      "if: ${{ !cancelled() && (needs.changes.result != 'success' || needs.changes.outputs.code != 'false') }}",
    );
  });

  it("cancels superseded runs per pull request, never a run on the default branch", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, matched literally
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});
