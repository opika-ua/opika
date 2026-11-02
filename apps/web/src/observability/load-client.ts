import { CLIENT_DSN } from "./dsn";

type IdleScheduler = (callback: () => void) => void;

/** `requestIdleCallback`, or a short timeout where a browser (Safari) lacks it. */
export const scheduleWhenIdle: IdleScheduler = (callback) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 5000 });
  else setTimeout(callback, 2000);
};

export type LoadClientDeps = {
  dsn: string | undefined;
  schedule: IdleScheduler;
  load: () => Promise<{ initClientSentry: (dsn: string) => unknown }>;
};

/**
 * Starts the browser SDK after the page is idle, and not at all without a DSN: with none, the
 * SDK module is never requested. A failed load (blocked, offline) is swallowed; monitoring never
 * breaks the page.
 */
export function loadSentryClientWhenIdle(deps: LoadClientDeps): boolean {
  const dsn = deps.dsn;
  if (dsn === undefined) return false;
  deps.schedule(() => {
    deps
      .load()
      .then((mod) => mod.initClientSentry(dsn))
      .catch(() => {});
  });
  return true;
}

/** Reports an error caught by a boundary; loads and starts the SDK at once if it isn't up yet. */
export function reportClientError(error: unknown, dsn: string | undefined = CLIENT_DSN): void {
  if (dsn === undefined) return;
  import("./client").then((mod) => mod.captureClientError(error, dsn)).catch(() => {});
}

export const startClientMonitoring = (): boolean =>
  loadSentryClientWhenIdle({
    dsn: CLIENT_DSN,
    schedule: scheduleWhenIdle,
    load: () => import("./client"),
  });
