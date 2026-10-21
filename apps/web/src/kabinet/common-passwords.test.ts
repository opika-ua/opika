import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commonPasswords } from "./common-passwords";
import { COMMON_PASSWORDS_TEXT } from "./common-passwords-list";
import { shelterPasswordVerdictOf } from "./password-checks";

/**
 * The bundled list (§9 answer 2: "SecLists top-100k (MIT, NOTICE line),
 * server-only"), as the policy asks it, and where it may be imported from.
 */

const SUBJECT = { email: "olena@example.org", shelterName: "Притулок «Ліс»" };

describe("the bundled common list", () => {
  it("holds the filtered entries, each folded and of 10 to 128 characters", () => {
    const entries = COMMON_PASSWORDS_TEXT.split("\n");
    expect(entries).toHaveLength(2311);
    expect(new Set(entries).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry, entry).toBe(entry.normalize("NFKC").toLowerCase());
      expect(entry.length, entry).toBeGreaterThanOrEqual(10);
      expect(entry.length, entry).toBeLessThanOrEqual(128);
    }
  });

  it("refuses listed passwords, in any case, through the served policy", () => {
    for (const password of ["1234567890", "qwertyuiop", "Password123", "ILOVEYOU12"]) {
      expect(shelterPasswordVerdictOf(password, SUBJECT), password).toEqual({ kind: "common" });
    }
    expect(commonPasswords.has("qwertyuiop")).toBe(true);
  });

  it("passes a long password that is not on it", () => {
    expect(shelterPasswordVerdictOf("ялинка-під-вікном-1987", SUBJECT)).toEqual({ kind: "ok" });
  });

  /**
   * The list keeps only entries of 10 characters or more. These are entries
   * of the top-100k that were dropped for being shorter: each is refused
   * anyway, as too short, before the list is asked.
   */
  it("dropped short entries are still refused, as too short", () => {
    for (const password of ["123456", "password", "qwerty", "iloveyou", "123456789"]) {
      expect(shelterPasswordVerdictOf(password, SUBJECT).kind, password).toBe("too_short");
      expect(commonPasswords.has(password), password).toBe(false);
    }
  });

  it("refuses a password containing the site's name, read from app config", () => {
    expect(shelterPasswordVerdictOf("мій-OPIKA-пароль", SUBJECT)).toEqual({
      kind: "contains_personal",
    });
  });
});

/**
 * Server only: the list never reaches a browser. Only the policy wiring
 * imports it, and only the auth hooks import the wiring; neither is a client
 * module. A new importer has to be added here on purpose.
 */
describe("the list is server only", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const importersOf = (module: string) =>
    files(SRC)
      .filter((path) =>
        new RegExp(`from\\s+["'][^"']*/${module}["']`).test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .sort();

  it("the list is imported by the set alone, the set by the policy wiring alone", () => {
    expect(importersOf("common-passwords-list")).toEqual(["kabinet/common-passwords.ts"]);
    expect(importersOf("common-passwords")).toEqual(["kabinet/password-checks.ts"]);
  });

  it("the policy wiring is imported only by the auth hooks, none of them a client module", () => {
    const importers = importersOf("password-checks");
    // PW-2: the invitation's «Створіть пароль» checks the policy too (§3: every write path).
    expect(importers).toEqual(["kabinet/invite-password.ts", "kabinet/password-hooks.ts"]);
    for (const file of [
      ...importers,
      "kabinet/password-checks.ts",
      "kabinet/common-passwords.ts",
    ]) {
      expect(readFileSync(join(SRC, file), "utf8"), file).not.toMatch(/^["']use client["']/m);
    }
  });
});
