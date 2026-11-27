import { CLIENT_DSN } from "../../../observability/dsn";
import type { CompressedPhoto } from "./compress-photo";
import type { PickedFile } from "./read-picked";

/** A photo that never got to an upload: the file unreadable at pick time, or a compression refusal or throw. */
export type PhotoFailure =
  | Extract<PickedFile, { kind: "not_readable" }>
  | Exclude<CompressedPhoto, { kind: "ok" }>
  | { kind: "threw"; error: unknown; type: string; size: number };

export type PhotoFailureReporter = (failure: PhotoFailure, fileName?: string) => void;

export const PHOTO_FAILURE_MESSAGE = "photo compression failed";
const MAX_ERROR_LENGTH = 200;
const MAX_TYPE_LENGTH = 64;

/** Diagnostics sit in `extra`: the scrubber drops every context but browser and os. */
export type PhotoFailureEvent = {
  level: "warning";
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  fingerprint: string[];
};

const clip = (text: string, max: number): string => text.slice(0, max);

/** A file name could carry a person's name; it is cut out of any error text that echoes it. */
function withoutName(text: string, fileName: string | undefined): string {
  return fileName === undefined || fileName.length < 3 ? text : text.split(fileName).join("[file]");
}

function thrownText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    if (typeof name === "string" && typeof message === "string") return `${name}: ${message}`;
  }
  return `non-error throw (${typeof error})`;
}

/**
 * The event for one failed compression, or null for one not worth a report: `unsupported_format`
 * is a HEIC on a browser that can't decode it, expected and not a bug. No EXIF orientation is sent.
 */
export function photoFailureEvent(
  failure: PhotoFailure,
  fileName?: string,
): PhotoFailureEvent | null {
  if (failure.kind === "unsupported_format") return null;
  const errorText = (text: string) => clip(withoutName(text, fileName), MAX_ERROR_LENGTH);
  if (failure.kind === "threw" || failure.kind === "not_readable") {
    // Same issue in Sentry; the step tells a file the device withheld from one that failed to decode.
    const [outcome, step] =
      failure.kind === "threw" ? ["unreadable", "threw"] : ["not_readable", "read"];
    const type = clip(failure.type, MAX_TYPE_LENGTH) || "none";
    return {
      level: "warning",
      tags: {
        "photo.outcome": outcome,
        "photo.step": step,
        "photo.type": type,
        "photo.format": "none",
      },
      extra: {
        attempts: [{ step, error: errorText(thrownText(failure.error)) }],
        type,
        size: failure.size,
      },
      fingerprint: ["photo", outcome, step, type, String(failure.size)],
    };
  }
  const d = failure.diagnostics;
  const attempts = (d?.attempts ?? []).map((a) => ({ step: a.step, error: errorText(a.error) }));
  const step = attempts.length > 0 ? (attempts[attempts.length - 1]?.step ?? "none") : "none";
  const type = d === undefined ? "none" : clip(d.type, MAX_TYPE_LENGTH) || "none";
  const header =
    d?.header == null
      ? null
      : { format: d.header.format, width: d.header.width, height: d.header.height };
  const decoded = d?.decoded == null ? null : { width: d.decoded.width, height: d.decoded.height };
  const size = d?.size ?? null;
  return {
    level: "warning",
    tags: {
      "photo.outcome": failure.kind,
      "photo.step": step,
      "photo.type": type,
      "photo.format": header?.format ?? "none",
    },
    extra: { attempts, type, size, header, decoded },
    // Dedupe drops an event equal to the one before; this keeps different files apart. The scrubber
    // drops the fingerprint before sending, so Sentry groups by its own rules.
    fingerprint: ["photo", failure.kind, step, type, String(size)],
  };
}

/** The SDK client's own `captureMessage`; `captureContext` carries what a scope would. */
type SentryLike = {
  captureMessage: (
    message: string,
    level: PhotoFailureEvent["level"],
    hint: { captureContext: Omit<PhotoFailureEvent, "level"> },
  ) => unknown;
};

export type ReportDeps = {
  dsn: string | undefined;
  load: (dsn: string) => Promise<SentryLike>;
};

/** Only through `observability/client`, as `load-client.ts` does; starts the SDK if not yet up. */
export async function loadSentryForReport(dsn: string): Promise<SentryLike> {
  const { initClientSentry } = await import("../../../observability/client");
  const client = initClientSentry(dsn);
  if (client === undefined) throw new Error("no Sentry client");
  return client;
}

const browserDeps: ReportDeps = { dsn: CLIENT_DSN, load: loadSentryForReport };

/**
 * One warning per failed compression. Fire and forget: without a DSN nothing loads, and a failed load
 * or send is swallowed so the upload screen never sees it. The promise is for tests; it never rejects.
 */
export function reportPhotoFailure(
  failure: PhotoFailure,
  fileName?: string,
  deps: ReportDeps = browserDeps,
): Promise<void> {
  const dsn = deps.dsn;
  if (dsn === undefined) return Promise.resolve();
  let event: PhotoFailureEvent | null;
  try {
    event = photoFailureEvent(failure, fileName);
  } catch {
    return Promise.resolve();
  }
  if (event === null) return Promise.resolve();
  const ready = event;
  return deps
    .load(dsn)
    .then((sdk) => {
      const { level, ...captureContext } = ready;
      sdk.captureMessage(PHOTO_FAILURE_MESSAGE, level, { captureContext });
    })
    .catch(() => undefined);
}

/**
 * Runs `compress` and reports a failure. A compressor that throws is, for the person, a file this
 * device couldn't open: `unreadable`, reported with what it threw.
 */
export async function compressReporting(
  compress: (file: File) => Promise<CompressedPhoto>,
  file: File,
  report: PhotoFailureReporter,
): Promise<CompressedPhoto> {
  let result: CompressedPhoto;
  try {
    result = await compress(file);
  } catch (error) {
    report({ kind: "threw", error, type: file.type, size: file.size }, file.name);
    return { kind: "unreadable" };
  }
  if (result.kind !== "ok") report(result, file.name);
  return result;
}
