# Decisions inbox: fix/pgf3-migrate-bypass

**WIP, unreviewed, tests missing.** Parked 2026-10-19 (Oleksii, verbatim: "PG-F3: park it. Don't
retry the stopped content in any form. … I'll write the tests myself, then it gets the full Tier 1
review."). A hard launch-gate item: no real shelters before it merges.

## Handoff

**What the source change does.** `pnpm db:migrate` no longer starts `drizzle-kit migrate`. It
applies the committed migrations in its own process with drizzle-orm's `migrate()`
(`packages/db/src/migrate-run.ts`, `applyMigrations`): one `postgres(url, { max: 1 })` connection,
`drizzle()`, the package's `drizzle/` folder, the default journal `drizzle.__drizzle_migrations`.
These are the calls drizzle-kit 0.31.10's own `migrate` made for Postgres, and the migrator the test
setup already uses. With drizzle-kit gone, its config file and its env-file loading never run.

**The one-URL flow.** `runMigrate` reads `DATABASE_URL` once, passes that value to the production
guard, to the `--expect` check and to the target line, then connects with the same value. Nothing
reads `DATABASE_URL` again.

**The refusals** (the second layer, his list), each before the guard runs and nothing connects:
- `--config` and `--config=…`;
- any `dotenv_config_*` argument;
- any other argument except `--prod` and `--expect ep-…`, never echoed;
- any `DOTENV_CONFIG_*` variable in the environment, named, its value not printed;
- a `.env` drizzle-kit would load (the working directory's, or `packages/db/.env`), named, never read.

`--prod --expect ep-dawn-pond-b1dz515g` is unchanged: the same guard, the same `--expect` check, the
same target line. The output after it is now one line, "Migrations: every committed migration is now
applied.", instead of drizzle-kit's progress.

**Also in the WIP:** `packages/db/test/no-network.mjs` blocks TCP connections beyond loopback as well
as `fetch`, and every spawned CLI in `prod-guard.test.ts` runs with it; the spawned `db:migrate`
tests no longer stop drizzle-kit with `--config=does-not-exist.ts`. None of the changed tests has
been run yet.

**Tests it still needs** (one line each):
1. `--config` in either form is refused, the reason naming the flag and not its value.
2. A `dotenv_config_*` argument is refused without its value being printed.
3. Any other argument is refused without being echoed; `--prod` and `--expect` still parse as before.
4. A `DOTENV_CONFIG_*` variable (any case) is refused and named, and neither the guard nor the migration is called.
5. An existing `.env` drizzle-kit would load is refused and named, never read, and nothing runs.
6. `dotenvFilesIn` reports a `.env` in the given directory, and nothing when there is none.
7. One URL: the migration connects with exactly the value the guard checked, and `DATABASE_URL` is read once.
8. A failing migration returns 1 with its message; success prints the target line, then the completion line.
9. On a fresh local database, a run applies every committed migration, db:check-hashes' comparison matches every hash, and a second run changes nothing.
10. The existing spawned `--prod` / `--expect` tests pass unchanged in meaning (the matching `--expect` reaches the migration, stopped by the network preload).
11. The network preload refuses a non-loopback connection with its message and leaves loopback working.

**Before review:** update the runbook's "Migrating production" step 2, which still says "then
drizzle-kit applying exactly the new migration".

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| PG-F3 | 2026-10-19 | `db:migrate` could reach a database the guard never checked | option 1 (he confirms by a local run first) · option 2 (build from the source reading) | — | — | Verbatim: "PG-F3: option 2. Build it from the source reading, Tier 1, full review, local databases only. Refusals, each with a test: --config, dotenv_config_* arguments, any DOTENV_CONFIG_* variable, and any .env file drizzle-kit would load. One URL: add a test that the URL the guard checks is the same value the migration connects with. Pass it through, never read it again. For the reviewer to compare: this approach versus running migrations through drizzle-orm's migrate() from our own script. That way drizzle-kit's config and .env loading never run, and the guard checks the only input. Pick whichever closes more routes with less code, and record why. Unchanged: --prod --expect ep-dawn-pond-b1dz515g still works exactly as today." | Parked, WIP |
| PG-F3-T1 | 2026-10-19 | Refusals around drizzle-kit, or drizzle-orm's `migrate()` from our own script | — | — | — | — | Decision taken: `migrate()` from our own script. It closes every route by construction (no config file, no env file, nothing else started), it is the same calls drizzle-kit made for Postgres, and it is less code than refusing each route around drizzle-kit. The refusals stay as the second layer he listed. For the reviewer to compare, his request. Reverse: put the `drizzle-kit migrate` spawn back behind the refusals |
