export { productionEndpoint } from "../prod-guard";
export {
  type AnimalFixtureOverrides,
  ageAnchorOf,
  makeAdopter,
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeReveal,
  makeShelter,
  makeSwipe,
  now,
  policy,
  uuid,
} from "./fixtures";
export {
  type PasswordRevokeCatalog,
  passwordRevokeCatalog,
  passwordRevokeIsInPlace,
  writeCredentialPassword,
} from "./password-revoke";
export { imageFactsOf, testJpeg } from "./photo-fixtures";
export { setupTestDatabase, type TestContext, truncateAll } from "./setup";
export { type SmokeTarget, smokeTarget } from "./smoke-target";
export {
  type StatementHold,
  type SteppedStatement,
  statementName,
  steppedDatabase,
} from "./stepped-database";
export {
  assertDisposableTestDatabase,
  disposeTestDatabaseAfterRun,
  dropTestDatabase,
  ensureTestDatabase,
  harnessPort,
  testDatabaseName,
  testDatabaseUrl,
} from "./test-database";
