import { afterAll, beforeAll, beforeEach } from "vitest";
import { setupTestDatabase, truncateAll } from "../src/test-utils/index.js";

export let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const result = await setupTestDatabase();
  db = result.db;
  cleanup = result.cleanup;
});

afterAll(async () => {
  await cleanup?.();
});

beforeEach(async () => {
  await truncateAll(db);
});
