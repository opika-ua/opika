import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARBITRARY_VALUES } from "./allowlist-arbitrary";
import { CLIENT_FILES } from "./allowlist-client";
import { KABINET_IMPORTERS, RAW_HEX, RAW_IMG } from "./allowlist-misc";
import { TOKEN_CEILINGS } from "./allowlist-tokens";
import {
  clientNavigationsIntoKabinet,
  exportedKabinetNames,
  kabinetImportsIn,
  kabinetNavigationsIn,
} from "./kabinet-entry";
import { ARBITRARY, HEX, IMG, NATIVE_DATE, TOKEN_PATTERNS } from "./patterns";
import { ceilingsOf, ratchetProblems } from "./ratchet";
import { clientFiles, formatHits, hitsByFile, SRC_ROOT } from "./scan";

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

describe("guard 5: no native date input", () => {
  // Its order follows the browser's language (mm/dd/yyyy in an English Chrome) and it takes a
  // five-digit year: every date is the kit's DateField.
  it("finds none in apps/web/src", () => {
    const hits = [...hitsByFile(NATIVE_DATE).values()].flat();
    expect(hits, formatHits(hits)).toEqual([]);
  });

  it("the pattern catches each way of writing one, and nothing else", () => {
    for (const written of ['type="date"', 'type={"date"}', 'type: "date"', "type='date'"]) {
      expect(written.match(NATIVE_DATE), written).not.toBeNull();
    }
    for (const other of ['type="text"', 'kind: "date"', 'inputType="date"']) {
      expect(other.match(NATIVE_DATE), other).toBeNull();
    }
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

/**
 * Owner, 2026-11-16 (stopgap until #510): a public page enters /kabinet only by a full document load,
 * through `KabinetEntryLink`. Outside the kabinet's own code (and in any server action) it catches an
 * href/pathname, a router push/replace/prefetch, a redirect/permanentRedirect or a next/form action
 * into /kabinet, written as a literal, a template, an exported constant that resolves to one, a local
 * one, an import alias or a namespace member, the value on the same line or the next; and any import
 * of a kabinet module but `KabinetEntryLink` and the reasoned `KABINET_IMPORTERS`. It can't see a value
 * built at runtime (concatenation, a function's result, a prop under another name), a constant
 * declared over several lines, or a re-export under another name; the harness checks the real entries.
 */
describe("guard 8: no client navigation into /kabinet from outside it", () => {
  it("finds none outside the kabinet's own code (KabinetEntryLink is the way in)", () => {
    const hits = clientNavigationsIntoKabinet();
    expect(hits, formatHits(hits)).toEqual([]);
  });

  it("knows the constants that hold a kabinet path, and not the public ones", () => {
    const names = exportedKabinetNames();
    for (const name of [
      "SHELTER_HOME",
      "SIGN_IN_PAGE_PATH",
      "FORGOT_PATH",
      "OPERATOR_HOME",
      "NEW_SHELTER_PATH",
      "animalPath",
      "SIGN_IN_LINK",
      "INVITE_LINK",
      "kabinetEntryHref",
    ]) {
      expect(names.has(name), name).toBe(true);
    }
    for (const name of ["PUBLIC_GALLERY_PATH", "publicShelterPath", "publicAnimalPath"]) {
      expect(names.has(name), name).toBe(false);
    }
  });

  const hitsIn = (code: string) =>
    kabinetNavigationsIn(
      "features/example/Example.tsx",
      code.split("\n").map((text, index) => ({ file: "x", line: index + 1, text, comment: false })),
      exportedKabinetNames(),
    );

  it("catches each way of writing one: a link, a router call, a redirect", () => {
    for (const written of [
      '<Link href="/kabinet">',
      "<Link href='/kabinet/vkhid'>",
      '<LinkButton href={SIGN_IN_PAGE_PATH} variant="secondary">',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner, holding a template on purpose
      "<TextLink href={`/kabinet/tvaryny/${id}`}>",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner, holding a template on purpose
      "<Link href={`${ANIMAL_LIST_PATH}/${id}`}>",
      "<Link href={animalPath(id)}>",
      '<Link href={{ pathname: "/kabinet" }}>',
      '{ key: "kabinet", href: "/kabinet/akaunt" }',
      '<Link href={kabinetEntryHref("home")}>',
      'router.push("/kabinet")',
      "router.replace(SHELTER_HOME)",
      "router.prefetch('/kabinet/vkhid')",
      'redirect("/kabinet/vkhid")',
      "permanentRedirect(OPERATOR_HOME)",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner, holding a template on purpose
      "redirect(`${SIGN_IN_LINK.path}?token=${token}`)",
      'const HOME = "/kabinet";\n<Link href={HOME}>',
      'import { SHELTER_HOME as HOME } from "../kabinet/routes";\n<Link href={HOME}>',
      'import {\n  SIGN_IN_PAGE_PATH as SIGN_IN,\n} from "../kabinet/routes";\nrouter.push(SIGN_IN)',
      "<Link href={routes.SHELTER_HOME}>",
      'router.push(\n  "/kabinet/vkhid",\n)',
      "redirect(\n  OPERATOR_HOME,\n)",
      "<Link\n  href={\n    SHELTER_HOME\n  }\n>",
      '<Form action="/kabinet/vkhid">',
      '<Form\n  className="x"\n  action={SIGN_IN_PAGE_PATH}\n>',
    ]) {
      expect(hitsIn(written), written).not.toEqual([]);
    }
  });

  it("leaves alone the way in, public links, full loads and plain declarations", () => {
    for (const other of [
      '<KabinetEntryLink to="home" variant="primary">',
      '<Link href="/prytulkam">',
      '<Link href="/kabinet-x">',
      'router.push("/tvaryny")',
      'redirect("/tvaryny")',
      'window.location.assign("/kabinet")',
      'export const SIGN_IN_PAGES_PATH = "/kabinet/vkhid";',
      "<Link href={publicShelterPath(id)}>",
      '<form method="post" action="/kabinet/vkhid">',
      'import { PUBLIC_GALLERY_PATH as GALLERY } from "../kabinet/routes";\n<Link href={GALLERY}>',
    ]) {
      expect(hitsIn(other), other).toEqual([]);
    }
  });

  const importsIn = (file: string, code: string) =>
    kabinetImportsIn(
      file,
      code.split("\n").map((text, index) => ({ file, line: index + 1, text, comment: false })),
    );

  it("a public file imports only the entry link from the kabinet; a type costs nothing", () => {
    const page = "app/prytulkam/page.tsx";
    for (const allowed of [
      'import { KabinetEntryLink } from "../../features/kabinet/KabinetEntryLink";',
      'import type { KabinetAuth } from "../../kabinet/auth";',
      'import { buttonClass } from "../../ui/Button";',
    ]) {
      expect(importsIn(page, allowed), allowed).toEqual([]);
    }
    for (const imported of [
      'import { SignInCard } from "../../features/kabinet/SignInCard";',
      'import { SHELTER_HOME } from "../../features/kabinet/routes";',
      'import KabinetLayout from "../kabinet/layout";',
      'const { kabinetAuth } = await import("../../kabinet/runtime");',
      'export { SignOutButton } from "../../features/kabinet/SignOutButton";',
    ]) {
      expect(importsIn(page, imported), imported).not.toEqual([]);
    }
  });

  it("every file allowed to import from the kabinet says why", () => {
    const thin = Object.entries(KABINET_IMPORTERS)
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([file]) => file);
    expect(thin).toEqual([]);
  });
});
