import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARBITRARY_VALUES } from "./allowlist-arbitrary";
import { CLIENT_FILES } from "./allowlist-client";
import { RAW_HEX, RAW_IMG } from "./allowlist-misc";
import { TOKEN_CEILINGS } from "./allowlist-tokens";
import { ARBITRARY, HEX, IMG, TOKEN_PATTERNS } from "./patterns";
import { ceilingsOf, ratchetProblems } from "./ratchet";
import { clientFiles, hitsByFile, SRC_ROOT } from "./scan";

/**
 * Source scans, not pixel checks ("Test logic, not looks"): they keep the UI
 * on one token set and one kit. Every allowlist is a ceiling per file that can
 * only go down (see `ratchet.ts`); the seed values are the 2026-10-28 state,
 * documented in `docs/ui/inventory-2026-10.md`. Guard 7 (kit coverage) is the last block below.
 */

function expectNoProblems(problems: string[]): void {
  expect(problems, problems.join("\n\n")).toEqual([]);
}

describe("guard 1: no raw hex colours in code", () => {
  it("only in the allowlisted files, within their ceilings", () => {
    expectNoProblems(ratchetProblems("raw hex", hitsByFile(HEX), ceilingsOf(RAW_HEX)));
  });
});

describe("guard 2: one token set", () => {
  it.each(Object.keys(TOKEN_PATTERNS) as (keyof typeof TOKEN_PATTERNS)[])(
    "%s classes stay within their per-file ceilings",
    (kind) => {
      expectNoProblems(
        ratchetProblems(`${kind} token`, hitsByFile(TOKEN_PATTERNS[kind]), TOKEN_CEILINGS[kind]),
      );
    },
  );
});

describe("guard 3: arbitrary Tailwind values", () => {
  it("only in the reasoned allowlist, within each file's ceiling", () => {
    expectNoProblems(
      ratchetProblems("arbitrary value", hitsByFile(ARBITRARY), ceilingsOf(ARBITRARY_VALUES)),
    );
  });

  it("every allowlist entry carries a reason", () => {
    const missing = Object.entries(ARBITRARY_VALUES)
      .filter(([, { reason }]) => reason.trim().length < 10)
      .map(([file]) => file);
    expect(missing).toEqual([]);
  });
});

describe("guard 4: no raw <img>", () => {
  it("photos go through next/image; the exceptions are listed", () => {
    expectNoProblems(ratchetProblems("raw <img>", hitsByFile(IMG), ceilingsOf(RAW_IMG)));
  });
});

describe("guard 6: the client-component budget", () => {
  it("every file with a use-client directive is listed, with a reason", () => {
    const actual = clientFiles();
    const listed = Object.keys(CLIENT_FILES);
    const added = actual.filter((f) => !listed.includes(f));
    const removed = listed.filter((f) => !actual.includes(f));
    expect(
      added,
      `New client file(s): ${added.join(", ")}. Prefer a server component; if it needs state or ` +
        "browser APIs, add it to allowlist-client.ts with a one-line reason.",
    ).toEqual([]);
    expect(
      removed,
      `No longer a client file (or gone): ${removed.join(", ")}. Delete its entry from allowlist-client.ts.`,
    ).toEqual([]);
  });

  it("every entry says why", () => {
    const empty = Object.entries(CLIENT_FILES)
      .filter(([, reason]) => reason.trim().length < 5)
      .map(([file]) => file);
    expect(empty).toEqual([]);
  });
});

describe("guard 7: kit coverage", () => {
  const uiDir = join(SRC_ROOT, "ui");
  const docsDir = resolve(SRC_ROOT, "../../../docs/ui/components");
  const showcaseDir = join(SRC_ROOT, "app/dev/ui");

  const components = readdirSync(uiDir)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .flatMap((f) =>
      [
        ...readFileSync(join(uiDir, f), "utf8").matchAll(
          /^export (?:function|const) ([A-Z][a-z]\w*)/gm,
        ),
      ].map((m) => m[1] as string),
    );
  const showcase = readdirSync(showcaseDir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(showcaseDir, f), "utf8"))
    .join("\n");
  const docs = new Set(readdirSync(docsDir));

  it("finds the kit's components", () => {
    expect(components.length).toBeGreaterThan(20);
  });

  it("every exported component has a doc under docs/ui/components", () => {
    const missing = components.filter((name) => !docs.has(`${name}.md`));
    expect(missing, `No docs/ui/components/<Name>.md for: ${missing.join(", ")}`).toEqual([]);
  });

  it("every exported component is rendered in the /dev/ui showcase", () => {
    const missing = components.filter((name) => !showcase.includes(`<${name}`));
    expect(missing, `Not rendered in app/dev/ui: ${missing.join(", ")}`).toEqual([]);
  });

  it("every doc names a component that still exists", () => {
    const orphans = [...docs]
      .map((f) => f.replace(/\.md$/, ""))
      .filter((name) => !components.includes(name));
    expect(orphans, `Doc without a component: ${orphans.join(", ")}`).toEqual([]);
  });
});
