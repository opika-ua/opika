// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sentryBuildOptions, sourceMapUploadEnabled } from "./build-options";

const UPLOAD = {
  VERCEL_ENV: "production",
  SENTRY_AUTH_TOKEN: "t",
  SENTRY_ORG: "o",
  SENTRY_PROJECT: "p",
};

describe("source map upload", () => {
  it("runs only for a Vercel production build with token, org and project", () => {
    expect(sourceMapUploadEnabled(UPLOAD)).toBe(true);
    for (const missing of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
      expect(sourceMapUploadEnabled({ ...UPLOAD, [missing]: undefined })).toBe(false);
      expect(sourceMapUploadEnabled({ ...UPLOAD, [missing]: "  " })).toBe(false);
    }
    for (const env of ["preview", "development", undefined]) {
      expect(sourceMapUploadEnabled({ ...UPLOAD, VERCEL_ENV: env })).toBe(false);
    }
  });
});

describe("sentryBuildOptions", () => {
  it("is null with no DSN and no upload: the build config is untouched", () => {
    expect(sentryBuildOptions({})).toBeNull();
    expect(sentryBuildOptions({ VERCEL_ENV: "preview", SENTRY_AUTH_TOKEN: "t" })).toBeNull();
  });

  it("with a DSN but no upload creates and uploads no source maps and passes no credentials", () => {
    const options = sentryBuildOptions({ NEXT_PUBLIC_SENTRY_DSN: "https://k@h.example/1" });
    expect(options?.sourcemaps.disable).toBe(true);
    expect(options).not.toHaveProperty("authToken");
    expect(options).not.toHaveProperty("org");
  });

  it("on a production build with the token uploads, then deletes the maps from the output", () => {
    const options = sentryBuildOptions({
      ...UPLOAD,
      NEXT_PUBLIC_SENTRY_DSN: "https://k@h.example/1",
    });
    expect(options?.sourcemaps).toEqual({ disable: false, deleteSourcemapsAfterUpload: true });
    expect(options).toMatchObject({ org: "o", project: "p", authToken: "t", telemetry: false });
  });

  it("never sets the managed tunnel and strips tracing and replay from the bundle", () => {
    const options = sentryBuildOptions({ NEXT_PUBLIC_SENTRY_DSN: "https://k@h.example/1" });
    expect(options).not.toHaveProperty("tunnelRoute");
    expect(options?.bundleSizeOptimizations).toMatchObject({
      excludeTracing: true,
      excludeReplayIframe: true,
      excludeReplayShadowDom: true,
      excludeReplayWorker: true,
    });
  });
});
