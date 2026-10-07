import { PROD_FLAG } from "./prod-guard";

/**
 * What `migrate.ts` hands to drizzle-kit: `migrate` plus everything the
 * caller passed, minus `--prod`, which is this package's flag and which
 * drizzle-kit doesn't know. Its own module so it is testable without
 * spawning anything.
 */
export const drizzleKitArgs = (argv: readonly string[]): string[] => [
  "migrate",
  ...argv.filter((arg) => arg !== PROD_FLAG),
];
