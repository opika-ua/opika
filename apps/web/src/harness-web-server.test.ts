import { describe, expect, it } from "vitest";
import config from "../playwright.config";

/**
 * The harness's server command empties every table, `auth_*` included,
 * between migrate and seed (#180's review, finding 2). `db:seed`'s truncate
 * leaves `auth_*` alone, so without the reset a run stopped after a kabinet
 * spec leaves an organization whose slug is a seeded shelter's id, and the
 * next run's invite of that shelter fails. What the reset does is tested in
 * `packages/db/test/harness-reset.test.ts`; this pins that the harness runs it,
 * in that order.
 */
describe("the harness's web server command", () => {
  const webServer = config.webServer;
  const command = Array.isArray(webServer) ? undefined : webServer?.command;
  const steps = (command ?? "").split(" && ");
  const position = (script: string) => steps.indexOf(`pnpm --filter @opika/db run ${script}`);

  it("resets the harness database after migrating it and before seeding it", () => {
    const migrate = position("db:migrate");
    const reset = position("test-db:reset");
    const seed = position("db:seed");
    expect({ migrate, reset, seed }).toEqual({
      migrate: expect.any(Number),
      reset: migrate + 1,
      seed: migrate + 2,
    });
    expect(migrate).toBeGreaterThanOrEqual(0);
  });
});
