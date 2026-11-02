type Env = Readonly<Record<string, string | undefined>>;

const set = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/** Source maps are uploaded from a Vercel production build that has all three build-time variables. */
export function sourceMapUploadEnabled(env: Env): boolean {
  return (
    env.VERCEL_ENV === "production" &&
    set(env.SENTRY_AUTH_TOKEN) &&
    set(env.SENTRY_ORG) &&
    set(env.SENTRY_PROJECT)
  );
}

/** `null` leaves `next.config.ts` exactly as it is: no DSN and no upload means no Sentry in the build. */
export function sentryBuildOptions(env: Env) {
  const upload = sourceMapUploadEnabled(env);
  if (!(set(env.NEXT_PUBLIC_SENTRY_DSN) || upload)) return null;
  return {
    ...(upload
      ? {
          org: env.SENTRY_ORG as string,
          project: env.SENTRY_PROJECT as string,
          authToken: env.SENTRY_AUTH_TOKEN as string,
        }
      : {}),
    silent: true,
    telemetry: false,
    // Maps go to Sentry and are deleted from the build output, so they are never served publicly;
    // `disable` keeps every other build (preview, local, CI) from creating any.
    sourcemaps: { disable: !upload, deleteSourcemapsAfterUpload: true },
    // The browser SDK is errors only: tracing and replay code is removed from the bundle.
    bundleSizeOptimizations: {
      excludeDebugStatements: true,
      excludeTracing: true,
      excludeReplayIframe: true,
      excludeReplayShadowDom: true,
      excludeReplayWorker: true,
    },
  } as const;
}
