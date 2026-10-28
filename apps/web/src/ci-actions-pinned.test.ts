import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Audit F13: a tag can be moved to other code; a commit SHA can't. Every action
 * a workflow runs names a full SHA, with its release as a trailing comment, and
 * the workflow token is read-only.
 */
const WORKFLOWS = resolve(fileURLToPath(import.meta.url), "../../../../.github/workflows");

describe("GitHub Actions are pinned to commit SHAs", () => {
  it("every `uses:` is owner/repo@<40-hex SHA> # vX.Y.Z", () => {
    const files = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
    expect(files.length).toBeGreaterThan(0);
    const uses = files.flatMap((name) =>
      readFileSync(resolve(WORKFLOWS, name), "utf8")
        .split("\n")
        .flatMap((line) => {
          const match = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/.exec(line);
          return match?.[1] ? [`${name}: ${match[1]}`] : [];
        }),
    );
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(use).toMatch(/^[\w.-]+: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it("every workflow's token can only read the repository", () => {
    for (const name of readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file))) {
      const workflow = readFileSync(resolve(WORKFLOWS, name), "utf8");
      expect(workflow, name).toMatch(/^permissions:\n {2}contents: read$/m);
      // No job widens it.
      expect(workflow, name).not.toMatch(/^ {4}permissions:/m);
    }
  });
});
