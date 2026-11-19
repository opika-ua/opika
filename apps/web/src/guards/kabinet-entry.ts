import { posix } from "node:path";
import { KABINET_IMPORTERS } from "./allowlist-misc";
import { type Hit, type SourceLine, sourceFiles } from "./scan";

/**
 * Guard 8 (owner, 2026-11-16; stopgap until #510): a public page enters /kabinet only by a full
 * document load, through `features/kabinet/KabinetEntryLink.tsx`. Exactly what it catches and what it
 * can't: the guard 8 comment in `ui-guards.test.ts` and `docs/security.md`.
 */

/** The kabinet's own code navigates within one kabinet document, the safe side. */
const KABINET_DIRS = ["features/kabinet/", "app/kabinet/", "kabinet/"];
/** The one kabinet module public code may import. */
export const KABINET_ENTRY_MODULE = "features/kabinet/KabinetEntryLink";

const inKabinet = (file: string) => KABINET_DIRS.some((dir) => file.startsWith(dir));

// A string or template that starts with the kabinet path: "/kabinet", '/kabinet/x', `/kabinet/${id}`.
const KABINET_LITERAL = String.raw`["'\x60]/kabinet(?![\w-])`;
const DECLARATION = /^\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(.*)$/;
const NAMED_IMPORT = /\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\b/g;
// The full regex escape (backslash included), though an identifier only ever brings `$`.
const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A kabinet literal, or a name known to hold (or build) one, bare, in a template or on a namespace. */
function kabinetValue(names: ReadonlySet<string>): string {
  const known = [...names].map(escapeName);
  return known.length === 0
    ? KABINET_LITERAL
    : `(?:${KABINET_LITERAL}|(?:\x60\\$\\{\\s*)?(?<![\\w$])(?:${known.join("|")})(?![\\w$]))`;
}

/** Each const whose one-line initialiser holds a kabinet value, repeated until nothing new joins. */
function resolve(declarations: [string, string][], start: ReadonlySet<string>): Set<string> {
  const names = new Set(start);
  for (let grew = true; grew; ) {
    grew = false;
    const value = new RegExp(kabinetValue(names));
    for (const [name, init] of declarations) {
      if (!names.has(name) && value.test(init)) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
}

function declarationsOf(lines: readonly SourceLine[], exported: boolean): [string, string][] {
  return lines.flatMap(({ text, comment }) => {
    const m = comment ? null : DECLARATION.exec(text);
    return m?.[2] !== undefined && Boolean(m[1]) === exported ? [[m[2], m[3] ?? ""]] : [];
  });
}

/** The file as one string, comment lines blanked, so a match may span lines and still has a line. */
const codeOf = (lines: readonly SourceLine[]) =>
  lines.map(({ text, comment }) => (comment ? "" : text)).join("\n");
const lineAt = (code: string, index: number) => code.slice(0, index).split("\n").length;

/**
 * Exported constants that resolve to a kabinet path, across `apps/web/src` (`SHELTER_HOME`,
 * `animalPath`...), each file's own unexported constants counted where its exports build on them.
 */
export function exportedKabinetNames(): Set<string> {
  const files = sourceFiles().map(({ lines }) => ({
    local: declarationsOf(lines, false),
    exported: declarationsOf(lines, true),
  }));
  const names = new Set<string>();
  for (let size = -1; size !== names.size; ) {
    size = names.size;
    for (const { local, exported } of files) {
      const here = resolve(local, names);
      for (const name of resolve(exported, here)) if (!here.has(name)) names.add(name);
    }
  }
  return names;
}

/** `import { SHELTER_HOME as HOME }`: the local name holds what the imported one does. */
function withAliases(code: string, names: ReadonlySet<string>): Set<string> {
  const out = new Set(names);
  for (const [, specifiers] of code.matchAll(NAMED_IMPORT)) {
    for (const part of (specifiers ?? "").split(",")) {
      const m = /^\s*(?:type\s+)?([\w$]+)\s+as\s+([\w$]+)\s*$/.exec(part);
      if (m?.[1] !== undefined && m[2] !== undefined && names.has(m[1])) out.add(m[2]);
    }
  }
  return out;
}

/** Client navigations into the kabinet: a link's href, a router call, a redirect, a next/form. */
export function kabinetNavigationPatterns(names: ReadonlySet<string>): RegExp[] {
  const value = kabinetValue(names);
  return [
    // `=` as an attribute or assignment, never `===`; `:` as an object key. Same line, or the next.
    new RegExp(String.raw`\b(?:href|pathname)\s*(?:=(?!=)|:)(?:[^\n]*?|\s*\{?\s*)${value}`, "g"),
    new RegExp(String.raw`\.(?:push|replace|prefetch)\(\s*${value}`, "g"),
    new RegExp(String.raw`\b(?:redirect|permanentRedirect)\(\s*${value}`, "g"),
    // next/form navigates on the client; a native <form> loads a new document.
    new RegExp(String.raw`<Form\b[^>]*?\baction\s*=\s*\{?\s*${value}`, "g"),
  ];
}

const isServerActionFile = (lines: readonly SourceLine[]) =>
  lines.some(({ text, comment }) => !comment && /^\s*["']use server["'];?\s*$/.test(text));

/** Matches in one file, given the exported names that hold a kabinet path. */
export function kabinetNavigationsIn(
  file: string,
  lines: readonly SourceLine[],
  names: ReadonlySet<string>,
): Hit[] {
  const code = codeOf(lines);
  const local = resolve(declarationsOf(lines, false), withAliases(code, names));
  return kabinetNavigationPatterns(local).flatMap((pattern) =>
    [...code.matchAll(pattern)]
      .filter((m) => !inFullLoadElement(code, m.index ?? 0))
      .map((m) => ({
        file,
        line: lineAt(code, m.index ?? 0),
        match: m[0].replace(/\s+/g, " "),
      })),
  );
}

/** Kit elements whose href is always a plain `<a>` (a full load), so they may carry a kabinet path. */
const FULL_LOAD_ELEMENTS = ["AuthCardFooter"];

/** True when the match sits inside the still-open tag of one of `FULL_LOAD_ELEMENTS`. */
function inFullLoadElement(code: string, index: number): boolean {
  const opened = code.slice(code.lastIndexOf("<", index), index);
  const tag = /^<([A-Za-z][\w.]*)/.exec(opened)?.[1];
  return tag !== undefined && !opened.includes(">") && FULL_LOAD_ELEMENTS.includes(tag);
}

const IMPORT_FROM = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']*)["']/g;

/**
 * Imports of kabinet modules by a file outside the kabinet: only `KABINET_ENTRY_MODULE`, so a
 * public page renders no other kabinet component. Type-only imports carry no code.
 */
export function kabinetImportsIn(file: string, lines: readonly SourceLine[]): Hit[] {
  return lines.flatMap(({ line, text, comment }) => {
    if (comment || /^\s*import\s+type\b/.test(text)) return [];
    return [...text.matchAll(IMPORT_FROM)].flatMap((m) => {
      const target = posix.normalize(posix.join(posix.dirname(file), m[1] ?? ""));
      return inKabinet(target) && target !== KABINET_ENTRY_MODULE
        ? [{ file, line, match: m[0] }]
        : [];
    });
  });
}

const allowedImporter = (file: string) =>
  Object.keys(KABINET_IMPORTERS).some((key) =>
    key.endsWith("/") ? file.startsWith(key) : file === key,
  );

/**
 * Every client navigation into /kabinet outside the kabinet's own code (a server action is checked
 * wherever it lives: its redirect runs as a client navigation in the calling page), and every
 * import of a kabinet module from outside it but the entry link and the reasoned `KABINET_IMPORTERS`.
 */
export function clientNavigationsIntoKabinet(): Hit[] {
  const names = exportedKabinetNames();
  return sourceFiles().flatMap(({ file, lines }) => [
    ...(!inKabinet(file) || isServerActionFile(lines)
      ? kabinetNavigationsIn(file, lines, names)
      : []),
    ...(!inKabinet(file) && !allowedImporter(file) ? kabinetImportsIn(file, lines) : []),
  ]);
}
