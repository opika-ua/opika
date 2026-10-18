# Finishing PR 4 (#116) after the R-UI stack lands

`prep/k3-form-on-r-ui-3` is #116 (`feat/k3-form` at `63075a1`) rebased onto R-UI 3's head
`454a5d7`, with R-UI 1 and 2 beneath it. Every conflict is already resolved. The finishing step
is mechanical if #121 is squashed at `454a5d7`.

## After #119, #120 (merge commits) and #121 (squash) are on the default branch

```
git fetch origin

# Precheck: the squash carries exactly R-UI 3's tree. Empty output means the rebase below is mechanical.
git diff --stat 454a5d7498568304420480668b7a6725aeb9b89a origin/main

# Precheck: #116 has not moved since the prep was built. Must print 63075a1….
git rev-parse origin/feat/k3-form

git rebase --onto origin/main 454a5d7498568304420480668b7a6725aeb9b89a prep/k3-form-on-r-ui-3

# The tree is unchanged by the rebase (empty output), and 0012 kept its name and hash.
git diff --stat ORIG_HEAD HEAD
git show HEAD:packages/db/drizzle/0012_glorious_warpath.sql | sha256sum
#   expect e3c0ffa7f2e2d1af4c0fbaa0323a4a2d4cfa62cb9fa4c9d9da7137cb327adfd4
git diff --stat origin/main HEAD -- packages/db/drizzle
#   expect only 0012_glorious_warpath.sql, meta/0012_snapshot.json, meta/_journal.json

git push --force-with-lease origin prep/k3-form-on-r-ui-3:feat/k3-form
```

Here `main` is the default branch. The push line names neither it nor the default branch, so
the protected-push hook lets it through. Every line runs in Git Bash. In Windows PowerShell
5.1, all but the hash line run as written. For the hash, use
`Get-FileHash packages\db\drizzle\0012_glorious_warpath.sql -Algorithm SHA256`. The file is LF
on disk (`.gitattributes`), so the bytes are the committed ones.

**Neon smoke total after the rebase: 31** (PR 3's 25, R-UI 1's step 26, then K3's 27–31). His
PR 4 gate said "30 passed, 0 failed"; that count predates R-UI 1's step. Expect
**31 passed, 0 failed** (`docs/k3-draft-shapes.md` §2.7).

The whole-catalogue kabinet copy total (`apps/web/src/kabinet/production-sign-in.test.ts`) is
**516**: R-UI's 400, plus K3's 116.

## If a precheck fails

- **The first precheck lists files.** Either the default branch has more than R-UI 3's tree,
  or #121 was squashed at a head after `454a5d7`. Use that head as the `--onto` upstream if it
  contains `454a5d7`. The rebase still runs, and stops only where the extra files overlap K3's.
  The likeliest overlap is that same test's total. If it conflicts, keep the default branch's
  lines, then add K3's line with the total raised by 115, 116 and 116. Those are the three K3
  commits that move it: «K3 copy», «K3 form UI» and «K3 review fixes: his final N5 copy».
- **The second precheck prints another sha.** #116 gained commits after the prep. Replay them
  with `git cherry-pick 63075a1..origin/feat/k3-form` before the push.

When #116 is rebased, this note has served its purpose. Delete it before the squash.
