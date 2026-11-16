import { type Hit, type SourceLine, sourceFiles } from "./scan";

/**
 * Guard 8 (owner, 2026-11-16): a public page enters /kabinet only by a full document load, through
 * `features/kabinet/KabinetEntryLink.tsx`. A client navigation would run the kabinet inside the
 * public document, under its CSP reporting and referrer policy.
 */

/** The kabinet's own code navigates within one kabinet document, the safe side. */
const KABINET_DIRS = ["features/kabinet/", "app/kabinet/", "kabinet/"];

// A string or template that starts with the kabinet path: "/kabinet", '/kabinet/x', `/kabinet/${id}`.
const KABINET_LITERAL = String.raw`["'\x60]/kabinet(?![\w-])`;
const DECLARATION = /^\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(.*)$/;
const escapeName = (name: string) => name.replace(/\$/g, "\\$");

/** A kabinet literal, or a name already known to hold (or build) one. */
function kabinetValue(names: ReadonlySet<string>): string {
  const known = [...names].map(escapeName);
  return known.length === 0
    ? KABINET_LITERAL
    : `(?:${KABINET_LITERAL}|(?:\x60\\$\\{\\s*)?(?<![\\w$.])(?:${known.join("|")})(?![\\w$]))`;
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

/** The three client navigations into the kabinet: a link's href, a router call, a redirect. */
export function kabinetNavigationPatterns(names: ReadonlySet<string>): RegExp[] {
  const value = kabinetValue(names);
  return [
    // `=` as an attribute or assignment, never `===`; `:` as an object key.
    new RegExp(String.raw`\b(?:href|pathname)\s*(?:=(?!=)|:)[^\n]*?${value}`, "g"),
    new RegExp(String.raw`\.(?:push|replace|prefetch)\(\s*${value}`, "g"),
    new RegExp(String.raw`\b(?:redirect|permanentRedirect)\(\s*${value}`, "g"),
  ];
}

const isServerActionFile = (lines: readonly SourceLine[]) =>
  lines.some(({ text, comment }) => !comment && /^\s*["']use server["'];?\s*$/.test(text));

/** Matches in one file's lines, given the names that hold a kabinet path there. */
export function kabinetNavigationsIn(
  file: string,
  lines: readonly SourceLine[],
  names: ReadonlySet<string>,
): Hit[] {
  const local = resolve(declarationsOf(lines, false), names);
  const patterns = kabinetNavigationPatterns(local);
  return lines.flatMap(({ line, text, comment }) =>
    comment
      ? []
      : patterns.flatMap((pattern) =>
          [...text.matchAll(pattern)].map((m) => ({ file, line, match: m[0] })),
        ),
  );
}

/**
 * Every client navigation into /kabinet outside the kabinet's own code; a server action is checked
 * wherever it lives, since its redirect runs as a client navigation in the page that called it.
 */
export function clientNavigationsIntoKabinet(): Hit[] {
  const names = exportedKabinetNames();
  return sourceFiles()
    .filter(
      ({ file, lines }) =>
        !KABINET_DIRS.some((dir) => file.startsWith(dir)) || isServerActionFile(lines),
    )
    .flatMap(({ file, lines }) => kabinetNavigationsIn(file, lines, names));
}
