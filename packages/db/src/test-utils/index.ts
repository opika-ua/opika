export { productionEndpoint } from "../prod-guard";
export {
  ageAnchorOf,
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  makeSwipe,
  now,
  policy,
  uuid,
} from "./fixtures";
export { setupTestDatabase, type TestContext, truncateAll } from "./setup";
export { type SmokeTarget, smokeTarget } from "./smoke-target";
export {
  assertDisposableTestDatabase,
  dropTestDatabase,
  ensureTestDatabase,
  harnessPort,
  testDatabaseName,
  testDatabaseUrl,
} from "./test-database";
