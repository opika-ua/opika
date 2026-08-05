import { customType } from "drizzle-orm/pg-core";

/**
 * A typed JSONB column. Drizzle's built-in `jsonb()` types as `unknown`;
 * this narrows it to the domain type at the TypeScript level while keeping
 * the same SQL: `jsonb NOT NULL` (or nullable, per `.notNull()` usage).
 *
 * The domain type is trusted, not validated here — validation happens at the
 * repository boundary via Zod parse on read.
 */
/**
 * ISO 8601 date string pattern. Used to revive Date objects that were
 * serialized to JSON — JSONB stores dates as strings, and the domain
 * types expect Date objects.
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    return new Date(value);
  }
  return value;
}

export function jsonb<T>(name: string) {
  return customType<{ data: T; driverData: string }>({
    dataType: () => "jsonb",
    toDriver: (value: T): string => JSON.stringify(value),
    fromDriver: (value: string): T => {
      const raw = typeof value === "string" ? value : JSON.stringify(value);
      return JSON.parse(raw, reviveDates) as T;
    },
  })(name);
}
