import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeSeedTarget } from "../src/seed";

/**
 * D-9, reduced 2026-09-06 (docs/build-plan.md, Phase D): no marker column,
 * no migration — the truncate-and-reseed guard lives entirely in this one
 * function. These tests are the actual limit `docs/standing-constraints.md`
 * asks for: each one would fail if the guard it names were removed or
 * loosened, not merely if the code shape changed — confirmed by mutating
 * the real function during review, not merely by reading it.
 */

function expectRefused(url: string, argv: readonly string[]): void {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit called");
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => assertSafeSeedTarget(url, argv)).toThrow("process.exit called");
  expect(exitSpy).toHaveBeenCalledWith(1);
  expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("does not point at localhost"));
}

function expectAllowed(url: string, argv: readonly string[]): void {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit called");
  });
  expect(() => assertSafeSeedTarget(url, argv)).not.toThrow();
  expect(exitSpy).not.toHaveBeenCalled();
}

describe("assertSafeSeedTarget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not exit for a plain localhost URL, no flags needed", () => {
    expectAllowed("postgres://opika:opika@localhost:5433/opika", []);
  });

  it.each([
    ["postgres://opika:opika@127.0.0.1:5433/opika", "127.0.0.1"],
    ["postgres://opika:opika@0.0.0.0:5433/opika", "0.0.0.0"],
  ])("does not exit for %s (%s)", (url) => {
    expectAllowed(url, []);
  });

  /**
   * Caught by review: the original guard tested `/localhost|127\.0\.0\.1|
   * 0\.0\.0\.0/` against the *whole connection string*, not the parsed
   * hostname — a substring test any of those three strings could satisfy
   * from inside a password, a database name, or a query parameter, with
   * *zero* flags. Confirmed against a real (not reasoned-about) local
   * database before the fix landed: this exact URL truncated it. The fix
   * is an exact match on `new URL(databaseUrl).hostname`.
   */
  it("exits for a non-localhost hostname even when the string 'localhost' appears elsewhere in the URL", () => {
    expectRefused("postgres://opika:pass_localhost_x@db.neon.tech:5432/opika_prod", []);
  });

  /**
   * The literal test named in the D-9 reprioritisation: `pnpm db:seed
   * --force` against a non-localhost URL must still exit non-zero.
   * --force alone was the entire hole in the pre-2026-09-06 guard.
   */
  it("exits for a non-localhost URL even with --force alone — the hole this row closes", () => {
    expectRefused("postgres://user:pass@db.neon.tech:5432/opika_prod", ["--force"]);
  });

  it("exits for a non-localhost URL with a matching --db-name but no --force", () => {
    expectRefused("postgres://user:pass@db.neon.tech:5432/opika_prod", ["--db-name=opika_prod"]);
  });

  it("exits for a non-localhost URL with --force and a --db-name that does not match", () => {
    expectRefused("postgres://user:pass@db.neon.tech:5432/opika_prod", [
      "--force",
      "--db-name=opika_staging",
    ]);
  });

  it("exits for a non-localhost URL with --force and an empty --db-name=", () => {
    expectRefused("postgres://user:pass@db.neon.tech:5432/opika_prod", ["--force", "--db-name="]);
  });

  /**
   * A pathless DATABASE_URL has an empty database name (`new
   * URL(...).pathname` is `""`). Without requiring `actualDbName` to be
   * non-empty, an empty `--db-name=` would trivially equal it — the
   * override firing with no real name ever having been typed. Round 1 of
   * review caught this as untested; round 2 found the first fix (checking
   * *both* sides' length) left `actualDbName.length > 0` itself
   * unmutation-pinned — removing only that clause still passed every test.
   * Simplified to the one check that's actually load-bearing
   * (`providedDbName === actualDbName` can't be satisfied by two empty
   * strings once `actualDbName` is required non-empty; a separate
   * `providedDbName.length > 0` added nothing), confirmed by deleting it
   * alone and watching this exact test go red.
   */
  it("exits for a pathless non-localhost URL even with --force and an empty --db-name=", () => {
    expectRefused("postgres://user:pass@db.neon.tech:5432", ["--force", "--db-name="]);
  });

  it("does not exit for a non-localhost URL once --force and the real --db-name both match", () => {
    expectAllowed("postgres://user:pass@db.neon.tech:5432/opika_prod", [
      "--force",
      "--db-name=opika_prod",
    ]);
  });

  it("reads the database name out of the URL's path, ignoring query parameters", () => {
    expectAllowed("postgres://user:pass@db.neon.tech:5432/opika_prod?sslmode=require", [
      "--force",
      "--db-name=opika_prod",
    ]);
  });
});
