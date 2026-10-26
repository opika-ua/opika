import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Node, SourceFile } from "typescript/unstable/ast";
import {
  isBindingElement,
  isElementAccessExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isStringLiteral,
} from "typescript/unstable/ast/is";
import { describe, expect, it } from "vitest";
import { nodesOf, readParsed } from "../../../test/source-ast";

/**
 * The public gallery reads no `kabinet.*` string. Oleksii, 2026-10-26, verbatim as the coordinating
 * session relayed it (inbox PC1b-T2): "split them. Add filters.temperament = «Характер» and
 * filters.colour = «Забарвлення» (same text, their own keys), mirroring filters.coat. The public
 * gallery must not read kabinet.* strings."
 *
 * The words are identical in both places, so nothing rendered can tell which key a label came from:
 * only the source can. This walks every non-test file of the gallery (`features/gallery`, and its
 * route, `app/tvaryny`) through the TypeScript parser (`test/source-ast.ts`), so a comment or a
 * string that mentions `uk.kabinet` neither fails it nor hides a real read, and fails on any member
 * named `kabinet`: `uk.kabinet`, `uk["kabinet"]`, or `const { kabinet } = uk`.
 */
const SRC = resolve(fileURLToPath(import.meta.url), "../../..");
const GALLERY_ROOTS = ["features/gallery", "app/tvaryny"];
const SOURCE = /\.(?:ts|tsx)$/;
const TEST = /\.(?:test|harness)\.(?:ts|tsx)$/;

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return SOURCE.test(name) && !TEST.test(name) ? [path] : [];
  });
}

/**
 * Every read of a member named `kabinet` in one file, as `line N: <how>`. The line is the node's
 * end, which is on the read itself; its `pos` includes the trivia before it.
 */
function kabinetReads(sourceFile: SourceFile): string[] {
  const at = (node: Node) => `line ${sourceFile.getLineAndCharacterOfPosition(node.end).line + 1}`;
  const found: string[] = [];
  for (const node of nodesOf(sourceFile)) {
    if (
      isPropertyAccessExpression(node) &&
      isIdentifier(node.name) &&
      node.name.text === "kabinet"
    ) {
      found.push(`${at(node)}: .kabinet`);
    } else if (
      isElementAccessExpression(node) &&
      isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "kabinet"
    ) {
      found.push(`${at(node)}: ["kabinet"]`);
    } else if (isBindingElement(node)) {
      const key = node.propertyName ?? node.name;
      if (key !== undefined && isIdentifier(key) && key.text === "kabinet") {
        found.push(`${at(node)}: { kabinet }`);
      }
    }
  }
  return found;
}

describe("the public gallery reads no kabinet.* string", () => {
  it("finds no read of `kabinet` in any gallery source file", () => {
    const files = GALLERY_ROOTS.flatMap((root) => sourceFilesUnder(join(SRC, root)));
    // The walk itself is checked, so an emptied root can't pass as "nothing found".
    expect(files.map((path) => relative(SRC, path).replaceAll("\\", "/"))).toEqual(
      expect.arrayContaining([
        "features/gallery/GalleryFilterDropdowns.tsx",
        "features/gallery/FilterSheet.tsx",
        "app/tvaryny/page.tsx",
      ]),
    );

    const texts = new Map(files.map((path) => [path, readFileSync(path, "utf8")] as const));
    const offences = [...readParsed(texts, kabinetReads)]
      .filter(([, reads]) => reads.length > 0)
      .map(([path, reads]) => `${relative(SRC, path).replaceAll("\\", "/")}: ${reads.join(", ")}`);
    expect(offences).toEqual([]);
  });

  it("the scan catches each way of reading it, and ignores comments and strings", () => {
    const reads = readParsed(
      new Map([
        ["dot.ts", 'import { uk } from "@opika/i18n";\nexport const a = uk.kabinet.x;'],
        ["bracket.ts", 'export const b = (uk as never)["kabinet"];'],
        ["destructure.ts", "const { kabinet } = uk;\nexport const c = kabinet;"],
        ["renamed.ts", "const { kabinet: k } = uk;\nexport const d = k;"],
        ["mentions.tsx", '// uk.kabinet.animalForm\nexport const e = "uk.kabinet";'],
        ["fine.tsx", "export const f = uk.filters.temperament;"],
      ]),
      kabinetReads,
    );
    expect(Object.fromEntries(reads)).toEqual({
      "dot.ts": ["line 2: .kabinet"],
      "bracket.ts": ['line 1: ["kabinet"]'],
      "destructure.ts": ["line 1: { kabinet }"],
      "renamed.ts": ["line 1: { kabinet }"],
      "mentions.tsx": [],
      "fine.tsx": [],
    });
  });
});
