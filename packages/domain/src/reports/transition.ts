import type { ModeratorId } from "../primitives/ids";
import type { Report, ReportStatus } from "./report";

export const REPORT_EVENT_TYPES = ["resolve", "dismiss"] as const;
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];
export type ReportEvent = { type: ReportEventType; at: Date; by: ModeratorId };

export type ReportTransitionResult =
  | { kind: "ok"; next: ReportStatus }
  | { kind: "illegal"; from: ReportStatus["kind"]; event: ReportEventType }
  | { kind: "non_monotonic"; createdAt: Date; eventAt: Date };

/** A decided report never moves again: no way back, no re-decision. */
export function decideReport(report: Report, event: ReportEvent): ReportTransitionResult {
  if (report.status.kind !== "open") {
    return { kind: "illegal", from: report.status.kind, event: event.type };
  }
  if (event.at < report.createdAt) {
    return { kind: "non_monotonic", createdAt: report.createdAt, eventAt: event.at };
  }
  return {
    kind: "ok",
    next:
      event.type === "resolve"
        ? { kind: "resolved", at: event.at, by: event.by }
        : { kind: "dismissed", at: event.at, by: event.by },
  };
}
