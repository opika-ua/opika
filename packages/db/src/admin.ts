import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createDatabase, type Database } from "./client";
import { assertProductionWriteAllowed } from "./prod-guard";
import { kabinetInvitedUsersRepo } from "./repos/kabinet-invited-users-repo";
import { superAdminRepo } from "./repos/super-admin-repo";

/**
 * The operator scripts (HS-Q4, RG-Q2, RS-Q1), run by Oleksii from his own
 * machine, never through the deployed app:
 *
 *   pnpm --filter @opika/db admin:bootstrap <email>   first operator, once (RG-Q2)
 *   pnpm --filter @opika/db admin:grant <email>       promote an existing user
 *   pnpm --filter @opika/db admin:revoke <email>      stamp revoked_at, never delete
 *   pnpm --filter @opika/db admin:sweep-invites       dry run; --apply deletes
 *
 * Every one refuses production without `--prod` (prod guard), prints the
 * target host and what it is about to touch, and asks before any write.
 */

export type AdminCommand = "bootstrap" | "grant" | "revoke" | "sweep-invites";

export type AdminDeps = {
  db: Database;
  now: Date;
  newId: () => string;
  /** Asks the operator; true only on an explicit "yes". */
  confirm: (question: string) => Promise<boolean>;
  log: (line: string) => void;
};

const USAGE: Record<AdminCommand, string> = {
  bootstrap: "admin:bootstrap <email> [--name=<name>] [--prod]",
  grant: "admin:grant <email> [--prod]",
  revoke: "admin:revoke <email> [--prod]",
  "sweep-invites": "admin:sweep-invites [--apply] [--prod]",
};

const emailArg = (args: readonly string[]): string | null => {
  const email = args.find((arg) => !arg.startsWith("--"));
  return email !== undefined && email.includes("@") ? email.trim().toLowerCase() : null;
};

/** The work of each command, after the guard. Returns the exit code. */
export async function runAdmin(
  command: AdminCommand,
  args: readonly string[],
  deps: AdminDeps,
): Promise<0 | 1> {
  if (command === "sweep-invites") return sweepInvites(args, deps);
  const email = emailArg(args);
  if (email === null) {
    deps.log(`Usage: ${USAGE[command]}`);
    return 1;
  }
  deps.log(`Email: ${email}`);
  const admins = superAdminRepo(deps.db);
  switch (command) {
    case "bootstrap": {
      if ((await admins.activeCount()) > 0) {
        deps.log("REFUSED: an operator already exists. Bootstrap runs once; use admin:grant.");
        return 1;
      }
      const name = args.find((arg) => arg.startsWith("--name="))?.slice("--name=".length) || email;
      if (!(await deps.confirm(`Create the user ${email} and make them the first operator?`))) {
        deps.log("Nothing written.");
        return 1;
      }
      const result = await admins.bootstrap({
        userId: deps.newId(),
        email,
        name,
        now: deps.now,
      });
      if (result.kind === "refused") {
        const why = {
          address_taken: "a user with this address already exists. Use admin:grant.",
          operator_exists: "an operator already exists. Nothing written.",
          // Also after the first operator's grant was revoked: bootstrap is
          // one-time (RG-T9); `admin:grant` on that still-existing user recovers.
          already_bootstrapped: "bootstrap has already run once. Use admin:grant. Nothing written.",
        }[result.reason];
        deps.log(`REFUSED: ${why}`);
        return 1;
      }
      deps.log("Done: the user exists and is an operator. Sign in with this address.");
      return 0;
    }
    case "grant": {
      if (!(await deps.confirm(`Make ${email} an operator?`))) {
        deps.log("Nothing written.");
        return 1;
      }
      const result = await admins.grant({ email, grantId: deps.newId(), now: deps.now });
      if (result.kind === "refused") {
        const why = {
          no_such_user: "no user has this address (the user must exist first)",
          already_operator: "this address is already an operator",
          shelter_admin: "this address administers a shelter; one person is never both",
          invited_admin:
            "this address has a live invitation to administer a shelter; withdraw it first (one person is never both)",
        }[result.reason];
        deps.log(`REFUSED: ${why}. Nothing written.`);
        return 1;
      }
      deps.log("Done: granted.");
      return 0;
    }
    case "revoke": {
      if (!(await deps.confirm(`Revoke ${email}'s operator access?`))) {
        deps.log("Nothing written.");
        return 1;
      }
      const result = await admins.revoke({ email, now: deps.now });
      if (result.kind === "refused") {
        deps.log("REFUSED: this address is not an active operator. Nothing written.");
        return 1;
      }
      deps.log("Done: revoked (the grant stays on record with its revocation time).");
      return 0;
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled command; unreachable at runtime */
    default: {
      const unreachable: never = command;
      throw new Error(`Unhandled command ${String(unreachable)}`);
    }
  }
}

/**
 * RS-Q1: the same clean-up the registry runs lazily on `admins.*`, across
 * every shelter. A dry run lists who it would delete; `--apply` deletes,
 * re-checking every condition in the delete itself.
 */
async function sweepInvites(args: readonly string[], deps: AdminDeps): Promise<0 | 1> {
  const users = kabinetInvitedUsersRepo(deps.db);
  const candidates = await users.cleanupCandidates({ organizationId: null, now: deps.now });
  deps.log(`${candidates.length} invited user(s) the clean-up would delete:`);
  for (const candidate of candidates) deps.log(`  ${candidate.email}`);
  if (!args.includes("--apply")) {
    deps.log("Dry run: nothing deleted. Re-run with --apply to delete.");
    return 0;
  }
  if (candidates.length === 0) return 0;
  if (!(await deps.confirm(`Delete these ${candidates.length} user(s)?`))) {
    deps.log("Nothing deleted.");
    return 1;
  }
  const deleted = await users.deleteCandidates(
    candidates.map((candidate) => candidate.userId),
    deps.now,
  );
  deps.log(`Deleted ${deleted}.`);
  return 0;
}

const COMMANDS: readonly AdminCommand[] = ["bootstrap", "grant", "revoke", "sweep-invites"];

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!COMMANDS.includes(command as AdminCommand)) {
    console.error(`Usage: ${Object.values(USAGE).join(" | ")}`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  // The dry run writes nothing, but it reads invited users' addresses, so
  // it takes --prod against production like the rest.
  const writes = command !== "sweep-invites" || args.includes("--apply");
  assertProductionWriteAllowed(databaseUrl, process.argv, process.env, writes ? "write" : "read");
  console.log(`Target host: ${new URL(databaseUrl).hostname}`);

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const code = await runAdmin(command as AdminCommand, args, {
    db: createDatabase(databaseUrl),
    now: new Date(),
    newId: randomUUID,
    confirm: async (question) =>
      (await readline.question(`${question} Type "yes" to continue: `)).trim() === "yes",
    log: (line) => console.log(line),
  });
  readline.close();
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
