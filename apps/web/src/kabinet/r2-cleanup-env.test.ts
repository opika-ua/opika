import { describe, expect, it } from "vitest";
import { r2CleanupEnvProblem, r2CleanupStateOf } from "./r2-cleanup-env";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). Tier 1 review (PR #200,
 * blocker 2) found the first version of `r2CleanupEnvProblem` copied
 * `photoUploadEnvProblem`'s "production can't boot without these" shape
 * wholesale — wrong for a job R2-B1 confirms, verbatim, "enabling it by the
 * env vars' presence": all four absent must mean "off," not "broken."
 * These tests pin the asymmetry directly, not just through `build-env.test.ts`'s
 * one "full production env" fixture.
 */
const FULL = {
  VERCEL_ENV: "production",
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET_NAME: "photos",
  R2_CLEANUP_ACCESS_KEY_ID: "id",
  R2_CLEANUP_SECRET_ACCESS_KEY: "secret",
};

describe("r2CleanupStateOf", () => {
  it(
    "is 'on', with the config, when all four are set (Tier 1 review, PR #200, finding 4: " +
      "the only path to 'on' had no direct test of its own)",
    () => {
      expect(r2CleanupStateOf(FULL)).toEqual({
        kind: "on",
        config: {
          accountId: "acct",
          bucketName: "photos",
          accessKeyId: "id",
          secretAccessKey: "secret",
        },
      });
    },
  );

  it("is 'off' when neither cleanup credential is set", () => {
    expect(r2CleanupStateOf({})).toEqual({ kind: "off" });
    expect(
      r2CleanupStateOf({
        VERCEL_ENV: "production",
        R2_ACCOUNT_ID: "acct",
        R2_BUCKET_NAME: "photos",
      }),
    ).toEqual({ kind: "off" });
  });

  it("is 'misconfigured' when any one of the four is missing while a cleanup credential is set", () => {
    for (const name of Object.keys(FULL).filter((k) => k !== "VERCEL_ENV")) {
      const state = r2CleanupStateOf({ ...FULL, [name]: undefined });
      expect(state.kind).toBe("misconfigured");
    }
  });
});

describe("r2CleanupEnvProblem", () => {
  it("is never a problem outside production", () => {
    expect(r2CleanupEnvProblem({})).toBeNull();
    expect(r2CleanupEnvProblem({ VERCEL_ENV: "preview" })).toBeNull();
  });

  it("all four absent, in production, is not a problem — the job is simply off", () => {
    expect(r2CleanupEnvProblem({ VERCEL_ENV: "production" })).toBeNull();
  });

  it("production's real off state: R2_ACCOUNT_ID/R2_BUCKET_NAME already set for uploads, neither cleanup credential set, is not a problem", () => {
    // The scenario this job actually ships into (Tier 1 delta review,
    // finding 3): the upload token's two shared vars are already required
    // in production regardless of this job, so "off" in practice never
    // looks like all four absent — it looks like exactly this. A mutation
    // that collapses this function to "a problem unless all four are
    // absent or all four are present" passes every other test here but
    // would wrongly flag this one as a problem.
    expect(
      r2CleanupEnvProblem({
        VERCEL_ENV: "production",
        R2_ACCOUNT_ID: "acct",
        R2_BUCKET_NAME: "photos",
      }),
    ).toBeNull();
  });

  it("all four present is not a problem", () => {
    expect(r2CleanupEnvProblem(FULL)).toBeNull();
  });

  it("the cleanup access key set without the secret is a problem, not 'off'", () => {
    expect(
      r2CleanupEnvProblem({
        VERCEL_ENV: "production",
        R2_CLEANUP_ACCESS_KEY_ID: "id",
      }),
    ).toMatch(/R2_CLEANUP_SECRET_ACCESS_KEY/);
  });

  it("the cleanup secret set without the access key is a problem, not 'off'", () => {
    expect(
      r2CleanupEnvProblem({
        VERCEL_ENV: "production",
        R2_CLEANUP_SECRET_ACCESS_KEY: "secret",
      }),
    ).toMatch(/R2_CLEANUP_ACCESS_KEY_ID/);
  });

  it("a cleanup credential set without R2_ACCOUNT_ID/R2_BUCKET_NAME is a problem", () => {
    const message = r2CleanupEnvProblem({
      VERCEL_ENV: "production",
      R2_CLEANUP_ACCESS_KEY_ID: "id",
      R2_CLEANUP_SECRET_ACCESS_KEY: "secret",
    });
    expect(message).toMatch(/R2_ACCOUNT_ID/);
    expect(message).toMatch(/R2_BUCKET_NAME/);
  });

  it("a padded value is a problem even when all four are otherwise present", () => {
    expect(r2CleanupEnvProblem({ ...FULL, R2_CLEANUP_ACCESS_KEY_ID: " id " })).toMatch(
      /space or a line break/,
    );
  });

  it("a padded value is a problem even when the job is otherwise off", () => {
    // Someone set ONE padded var and nothing else — still worth surfacing,
    // never silently read as "off" just because the other three are unset.
    expect(r2CleanupEnvProblem({ VERCEL_ENV: "production", R2_ACCOUNT_ID: " acct " })).toMatch(
      /space or a line break/,
    );
  });
});
