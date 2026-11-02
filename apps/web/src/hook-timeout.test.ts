import { DEFAULT_MAINTENANCE_LIMITS } from "@opika/db/test";
import { describe, expect, it } from "vitest";
import config from "../vitest.config";

// A beforeAll that calls setupTestDatabase may wait the whole lock wait, then create and migrate.
const MARGIN_MS = 15_000;

describe("DB-using vitest projects' hook timeout", () => {
  it("outlasts the maintenance lock wait plus create/migrate time in api and dom", () => {
    const projects = (config.test?.projects ?? []) as {
      test?: { name?: string; hookTimeout?: number };
    }[];
    const named = projects.map((p) => p.test);
    // browser-sdk (H5) has no DB, so no hook budget to hold.
    expect(named.map((t) => t?.name)).toEqual(["api", "dom", "browser-sdk"]);
    for (const t of named.filter((t) => t?.name !== "browser-sdk")) {
      expect(t?.hookTimeout).toBeGreaterThanOrEqual(
        DEFAULT_MAINTENANCE_LIMITS.lockWaitMs + MARGIN_MS,
      );
    }
  });
});
