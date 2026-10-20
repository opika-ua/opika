import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authAccount } from "../schema/auth";

/**
 * PW1-F5 (migration 0013): writing a credential's password ends every kabinet session of its
 * user in the same statement. What the catalog check and the direct write below look for, by
 * name, for the tests and the real-Neon auth smoke (`apps/web/scripts/neon-auth-smoke.ts`).
 */
const PASSWORD_REVOKE_FUNCTION = "auth_account_password_revokes_sessions";
const PASSWORD_REVOKE_TRIGGERS = [
  "auth_account_password_insert_revokes_sessions",
  "auth_account_password_update_revokes_sessions",
] as const;

export type PasswordRevokeCatalog = {
  /**
   * Every trigger on `auth_account` that calls the function, as the catalog holds it: `enabled`
   * is `pg_trigger.tgenabled` (`O` fires; `D` is disabled), `definition` Postgres' own rendering.
   */
  triggers: { name: string; enabled: string; definition: string }[];
  /** The function in `public`: whose privileges it runs with, and the settings it pins. */
  functions: { security: string; settings: string }[];
};

/**
 * Read from `pg_catalog` through the query builder, every value cast to text, so the result is
 * the same on postgres-js and neon-http (standing constraints, R1: no raw `.execute()`).
 */
export async function passwordRevokeCatalog(db: Database): Promise<PasswordRevokeCatalog> {
  const triggers = await db
    .select({
      name: sql<string>`t.tgname::text`,
      enabled: sql<string>`t.tgenabled::text`,
      definition: sql<string>`pg_catalog.pg_get_triggerdef(t.oid)`,
    })
    .from(sql`pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid`)
    .where(
      sql`t.tgrelid = 'public.auth_account'::regclass AND NOT t.tgisinternal AND p.proname = ${PASSWORD_REVOKE_FUNCTION}`,
    )
    .orderBy(sql`t.tgname`);
  const functions = await db
    .select({
      security: sql<string>`CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END`,
      settings: sql<string>`coalesce(array_to_string(p.proconfig, ','), '')`,
    })
    .from(sql`pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace`)
    .where(sql`n.nspname = 'public' AND p.proname = ${PASSWORD_REVOKE_FUNCTION}`);
  return { triggers, functions };
}

/** Both triggers present and firing, and the function there, running as its caller. */
export const passwordRevokeIsInPlace = (catalog: PasswordRevokeCatalog): boolean =>
  catalog.functions.length === 1 &&
  catalog.functions[0]?.security === "invoker" &&
  catalog.triggers.length === PASSWORD_REVOKE_TRIGGERS.length &&
  PASSWORD_REVOKE_TRIGGERS.every((name) =>
    catalog.triggers.some((trigger) => trigger.name === name && trigger.enabled === "O"),
  );

/**
 * Writes a new hash into the user's credential with our own statement, no Better Auth anywhere:
 * how the tests and the smoke show that the write alone ends the sessions.
 */
export async function writeCredentialPassword(
  db: Database,
  userId: string,
  hash: string,
  now: Date,
): Promise<void> {
  await db
    .update(authAccount)
    .set({ password: hash, updatedAt: now })
    .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
}
