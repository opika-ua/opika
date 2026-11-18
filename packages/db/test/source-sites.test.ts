import { describe, expect, it } from "vitest";
import { type Anchor, compareSites, MODULE_SYMBOL, sitesIn } from "./source-sites";

/**
 * The anchors the source-scan guards (visibility-write, auth-user-deletion, photo-storage-key)
 * pin sites by. Fixture text only: the guards themselves run on the real sources.
 */
const PATTERN = /\.delete\(authUser\)|DELETE FROM "auth_user"/;
const FILE = "repos/fixture-repo.ts";

const BASE = [
  "export function fixtureRepo(db: Db) {",
  "  return {",
  "    async removeOne(id: string) {",
  "      await db.delete(authUser).where(eq(authUser.id, id));",
  "    },",
  "    async keep() {",
  "      const rows = await db.select().from(authUser);",
  "      return rows;",
  "    },",
  "  };",
  "}",
  "export async function erase(tx: Tx) {",
  "  await tx.execute(sql`",
  '    DELETE FROM "auth_user"',
  "  `);",
  "}",
].join("\n");

const EXPECTED: Anchor[] = [
  {
    file: FILE,
    symbol: "fixtureRepo.removeOne",
    text: "await db.delete(authUser).where(eq(authUser.id, id));",
  },
  { file: FILE, symbol: "erase", text: 'DELETE FROM "auth_user"' },
];

const check = (source: string, expected: ReadonlyArray<Anchor> = EXPECTED) =>
  compareSites(sitesIn(new Map([[FILE, source]]), PATTERN), expected);
const exact = { unexpected: [], missing: [] };

describe("source-site anchors", () => {
  it("names a method in a returned repo object, and a site inside a SQL template, by symbol", () => {
    expect(check(BASE)).toEqual(exact);
  });

  it("an extra unlisted site fails, naming its file, line and symbol", () => {
    const source = BASE.replace(
      "      return rows;",
      "      await db.delete(authUser);\n      return rows;",
    );
    expect(check(source)).toEqual({
      unexpected: [`${FILE}:8 in fixtureRepo.keep: await db.delete(authUser);`],
      missing: [],
    });
  });

  it("a removed site fails as missing", () => {
    const source = BASE.replace('    DELETE FROM "auth_user"', "    SELECT 1");
    expect(check(source)).toEqual({
      unexpected: [],
      missing: [`${FILE} in erase: DELETE FROM "auth_user"`],
    });
  });

  it("blank lines and new code above a site pass", () => {
    const above = "\n\n// a new comment\nexport const unrelated = () => 1;\n\n";
    expect(check(above + BASE)).toEqual(exact);
  });

  it("a site moving within its function passes; moving to another function fails", () => {
    const within = BASE.replace(
      "    async removeOne(id: string) {",
      "    async removeOne(id: string) {\n      const before = 1;\n      void before;",
    );
    expect(check(within)).toEqual(exact);

    const moved = BASE.replace(
      "      await db.delete(authUser).where(eq(authUser.id, id));\n",
      "",
    ).replace(
      "      return rows;",
      "      await db.delete(authUser).where(eq(authUser.id, id));\n      return rows;",
    );
    const result = check(moved);
    expect(result.unexpected).toHaveLength(1);
    expect(result.unexpected[0]).toContain("in fixtureRepo.keep:");
    expect(result.missing).toHaveLength(1);
  });

  it("identical lines in one symbol are told apart by occurrence, so a third one fails", () => {
    const line = '    DELETE FROM "auth_user"';
    const twice = BASE.replace(line, `${line}\n${line}`);
    const both: Anchor[] = [...EXPECTED, { ...EXPECTED[1], occurrence: 1 } as Anchor];
    expect(check(twice, both)).toEqual(exact);
    expect(check(BASE.replace(line, `${line}\n${line}\n${line}`), both).unexpected).toEqual([
      `${FILE}:16 in erase #2: DELETE FROM "auth_user"`,
    ]);
  });

  it("a local const holding data adds no name; a top-level statement is <module>", () => {
    const source = [
      "export function outer() {",
      "  const plan = {",
      "    run: () => db.delete(authUser),",
      "  };",
      "}",
      "await db.delete(authUser);",
    ].join("\n");
    expect(sitesIn(new Map([[FILE, source]]), PATTERN).map((s) => s.symbol)).toEqual([
      "outer.run",
      MODULE_SYMBOL,
    ]);
  });

  it("a duplicate anchor or a file that does not parse is an error, not a pass", () => {
    expect(() => check(BASE, [...EXPECTED, EXPECTED[0] as Anchor])).toThrow(/duplicate anchor/);
    expect(() => check(`${BASE}\nexport function broken( {`)).toThrow(/does not parse/);
  });
});
