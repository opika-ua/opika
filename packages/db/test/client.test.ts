import { entityKind } from "drizzle-orm/entity";
import { describe, expect, it } from "vitest";
import { createDatabase, isNeonHost } from "../src/client";

/**
 * O-9, 2026-09-06 reprioritisation ("2.1") — the cheapest test in the
 * codebase for the branch that decides which driver a real deployment
 * uses. Caught on review: the first version was case-sensitive
 * (`postgres:` is not a WHATWG "special" scheme, so `URL` never
 * lowercases its host) and an uppercased hostname would have silently
 * kept the slow TCP driver in production with nothing red anywhere. This
 * pins the fix.
 */
describe("isNeonHost", () => {
  it.each([
    ["postgres://opika:opika@localhost:5433/opika", false, "local docker-compose Postgres"],
    ["postgres://opika:opika@127.0.0.1:5433/opika", false, "local Postgres by IP"],
    [
      "postgres://user:pass@ep-cool-forest-123456.eu-central-1.aws.neon.tech/opika",
      true,
      "Neon direct connection string",
    ],
    [
      "postgres://user:pass@ep-cool-forest-123456-pooler.eu-central-1.aws.neon.tech/opika",
      true,
      "Neon pooled connection string",
    ],
    [
      "postgres://user:pass@EP-COOL-FOREST-123456-POOLER.EU-CENTRAL-1.AWS.NEON.TECH/opika",
      true,
      "an uppercased Neon hostname — postgres: is not a WHATWG special scheme, so URL never lowercases it for us",
    ],
    ["postgres://user:pass@db.example.com/opika", false, "an arbitrary non-Neon remote host"],
    [
      "postgres://user:pass@evil.com/opika?x=.neon.tech",
      false,
      "neon.tech appearing outside the hostname must not match",
    ],
  ])("%s -> %s (%s)", (url, expected) => {
    expect(isNeonHost(url)).toBe(expected);
  });

  it("throws without leaking the connection string when the URL itself is malformed", () => {
    const withPassword = "not a url at all, but pretend it has password=hunter2 in it";
    let caught: unknown;
    try {
      isNeonHost(withPassword);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = JSON.stringify(caught, Object.getOwnPropertyNames(caught));
    expect(message).not.toContain("hunter2");
  });
});

/**
 * `isNeonHost` alone doesn't prove `createDatabase` actually acts on it —
 * an inverted `if` would still pass every `isNeonHost` test and every
 * other suite in this repo, and only fail against a real Neon database,
 * which nothing here can reach. This is the offline-checkable half:
 * constructing a driver for each branch is a pure, local operation for
 * both adapters (neither opens a socket or makes a request until a query
 * actually runs), so the two branches' *class identity* — via
 * `entityKind`, the same symbol Drizzle itself uses internally to tell
 * its driver classes apart, more stable than `constructor.name` under a
 * bundler — can be asserted without ever reaching a network.
 */
describe("createDatabase — branch selection", () => {
  it("returns a different driver class for a Neon host than for a local one", () => {
    const neonDb = createDatabase("postgres://user:pass@ep-x.eu-central-1.aws.neon.tech/opika");
    const localDb = createDatabase("postgres://opika:opika@localhost:5433/opika");

    const neonKind = (neonDb.constructor as { [entityKind]?: string })[entityKind];
    const localKind = (localDb.constructor as { [entityKind]?: string })[entityKind];

    expect(neonKind).toBeDefined();
    expect(localKind).toBeDefined();
    expect(neonKind).not.toBe(localKind);
    expect(localKind).toBe("PostgresJsDatabase");
    expect(neonKind).toBe("NeonHttpDatabase");
  });
});
