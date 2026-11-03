import { CLIENT_DSN } from "./dsn";

/**
 * Lighthouse's measuring window ends a few seconds after `load`; loading the 83 KB (gzip) SDK inside
 * it costs TBT and unused JS. A real visitor who interacts or hits an error loads it sooner.
 */
export const LOAD_DELAY_MS = 4500;

/** Errors held until the SDK is up; the oldest drop first so a crash loop can't grow memory. */
export const MAX_QUEUED_ERRORS = 20;

/** Each wiring returns its own clean-up. */
export type Triggers = {
  afterLoadDelay: (fire: () => void) => () => void;
  onInteraction: (fire: () => void) => () => void;
  onError: (fire: (error: unknown) => void) => () => void;
};

type SentryClientModule = {
  initClientSentry: (dsn: string) => unknown;
  captureClientError: (error: unknown, dsn: string) => void;
};

export type LoadClientDeps = {
  dsn: string | undefined;
  triggers: Triggers;
  load: () => Promise<SentryClientModule>;
};

/**
 * Starts the browser SDK on the first of: a delay after page load, a first interaction, or a first
 * error; and not at all without a DSN (the SDK module is never requested). Errors that happen
 * before it is up are queued (bounded) and replayed through the SDK, so they still pass the
 * scrubber in `beforeSend`. A failed load (blocked, offline) is swallowed; monitoring never breaks
 * the page.
 */
export function loadSentryClientDeferred(deps: LoadClientDeps): boolean {
  const dsn = deps.dsn;
  if (dsn === undefined) return false;
  const queue: unknown[] = [];
  let started = false;
  const cleanups: Array<() => void> = [];
  const stopListening = () => {
    for (const stop of cleanups) stop();
  };
  const start = () => {
    if (started) return;
    started = true;
    deps
      .load()
      .then((mod) => {
        mod.initClientSentry(dsn);
        // The SDK's own global handlers take over from here.
        stopListening();
        for (const error of queue.splice(0)) mod.captureClientError(error, dsn);
      })
      .catch(() => {
        stopListening();
        queue.length = 0;
      });
  };
  cleanups.push(
    deps.triggers.afterLoadDelay(start),
    deps.triggers.onInteraction(start),
    deps.triggers.onError((error) => {
      if (queue.length >= MAX_QUEUED_ERRORS) queue.shift();
      queue.push(error);
      start();
    }),
  );
  return true;
}

const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

export const browserTriggers: Triggers = {
  afterLoadDelay: (fire) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(fire, LOAD_DELAY_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      clearTimeout(timer);
    };
  },
  onInteraction: (fire) => {
    for (const type of INTERACTION_EVENTS)
      window.addEventListener(type, fire, { once: true, passive: true });
    return () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, fire);
    };
  },
  onError: (fire) => {
    const onError = (event: ErrorEvent) => fire(event.error ?? new Error(event.message));
    const onRejection = (event: PromiseRejectionEvent) => fire(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  },
};

/** Reports an error caught by a boundary; loads and starts the SDK at once if it isn't up yet. */
export function reportClientError(error: unknown, dsn: string | undefined = CLIENT_DSN): void {
  if (dsn === undefined) return;
  import("./client").then((mod) => mod.captureClientError(error, dsn)).catch(() => {});
}

export const startClientMonitoring = (): boolean =>
  loadSentryClientDeferred({
    dsn: CLIENT_DSN,
    triggers: browserTriggers,
    load: () => import("./client"),
  });
