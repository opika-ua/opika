# Pre-launch rehearsal deletions

Each line below is a rehearsal shelter removed with `pnpm --filter @opika/db shelters:delete-test`.
Its `application_deletions` row is recorded with the reason `not_me` (owner, 2026-11-18: no
migration for a reason of its own), so these rows are rehearsal deletions and must never be counted
as real «Це не я» events. The command prints each line after a successful `--commit`; it is added
here by a docs PR. No names or addresses: the repo is public.

