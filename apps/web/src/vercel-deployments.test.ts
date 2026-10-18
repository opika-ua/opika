import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Only the default branch deploys (Oleksii, 2026-10-18: "only main creates deployments (PR
 * branches create none, not even cancelled ones)"). Vercel Hobby caps deployments per day, and
 * every push to a PR branch was spending one, until production merges were rate limited.
 *
 * Vercel's rules (https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled):
 * keys are minimatch patterns; a branch matching several rules deploys if any of them is `true`;
 * a branch matching none deploys. So `"**": false` turns every branch off, and `"main": true`
 * turns the default branch back on. It must be `**`, not `*`: minimatch's `*` stops at `/`, and
 * every branch here has one (`feat/…`, `copy/…`, `fix/…`), so `*` would leave them all deploying.
 * A disabled branch creates no deployment at all, unlike an Ignored Build Step, which creates a
 * cancelled one.
 *
 * Pinned exactly, because both failure modes are silent: dropping `"main": true` stops
 * production deploys; widening the off-switch back to `*` restores every preview.
 */
describe("apps/web/vercel.json deploys the default branch and nothing else", () => {
  const WEB = resolve(fileURLToPath(import.meta.url), "../..");
  const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
    git?: { deploymentEnabled?: unknown };
  };

  it("turns every branch off with `**` and the default branch back on", () => {
    expect(config.git?.deploymentEnabled).toEqual({ "**": false, main: true });
  });
});
