import { describe, expect, it } from "vitest";
import { DEFAULT_MAINTENANCE_LIMITS } from "../src/test-utils/test-database";
import config from "../vitest.config";

// A beforeAll that calls setupTestDatabase may wait the whole lock wait, then create and migrate.
const MARGIN_MS = 15_000;

describe("DB project hook timeout", () => {
  it("outlasts the maintenance lock wait plus create/migrate time", () => {
    expect(config.test?.hookTimeout).toBeGreaterThanOrEqual(
      DEFAULT_MAINTENANCE_LIMITS.lockWaitMs + MARGIN_MS,
    );
  });
});
