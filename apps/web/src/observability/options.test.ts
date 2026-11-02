// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseSentryOptions, MINIMAL_DATA_COLLECTION, TUNNEL_PATH } from "./options";

const require = createRequire(import.meta.url);

/** The top-level keys of the installed SDK's `DataCollection` interface, read from its own typings. */
function sdkDataCollectionKeys(): string[] {
  const nextjs = require.resolve("@sentry/nextjs/package.json");
  const core = require.resolve("@sentry/core/package.json", { paths: [dirname(nextjs)] });
  const typings = readFileSync(
    join(dirname(core), "build/types/types/datacollection.d.ts"),
    "utf8",
  );
  const body = typings.slice(typings.indexOf("export interface DataCollection {"));
  const interfaceBody = body.slice(0, body.indexOf("\n}\n"));
  const keys = new Set<string>();
  // A key sits at exactly four spaces of indent; nested ones are deeper.
  for (const match of interfaceBody.matchAll(/^ {4}(\w+)\??:/gm)) keys.add(match[1] as string);
  return [...keys];
}

describe("dataCollection is set to nothing, key by key", () => {
  it("names every key the installed SDK defines, so a new key cannot default to on", () => {
    const sdkKeys = sdkDataCollectionKeys();
    expect(sdkKeys.length).toBeGreaterThan(8);
    expect(Object.keys(MINIMAL_DATA_COLLECTION).sort()).toEqual([...sdkKeys].sort());
  });

  it("has no truthy leaf anywhere", () => {
    const truthy: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        if (value.length > 0) truthy.push(path);
      } else if (typeof value === "object" && value !== null) {
        for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
      } else if (value) truthy.push(path);
    };
    walk(MINIMAL_DATA_COLLECTION, "dataCollection");
    expect(truthy).toEqual([]);
  });
});

describe("the options every runtime shares", () => {
  const options = baseSentryOptions("https://k@o1.ingest.de.sentry.io/1");

  it("turns tracing off and collects no default PII", () => {
    expect(options.sendDefaultPii).toBe(false);
    expect(options.dataCollection).toBe(MINIMAL_DATA_COLLECTION);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.sendClientReports).toBe(false);
  });

  it("sets no tracing key (tracesSampleRate 0 is not off in v11) and stops trace headers going out", () => {
    const keys = Object.keys(options);
    for (const tracing of [
      "tracesSampleRate",
      "tracesSampler",
      "enableTracing",
      "traceLifecycle",
    ]) {
      expect(keys).not.toContain(tracing);
    }
    expect(options.tracePropagationTargets).toEqual([]);
  });

  it("scrubs events and breadcrumbs", () => {
    expect(options.beforeSend?.({ user: { email: "a@b.ua" } })).toEqual({});
    expect(options.beforeBreadcrumb?.({ category: "console" })).toBeNull();
  });

  it("does not enable local variables, replay, profiling or feedback", () => {
    const keys = Object.keys(options);
    for (const forbidden of [
      "includeLocalVariables",
      "replaysSessionSampleRate",
      "replaysOnErrorSampleRate",
      "profilesSampleRate",
      "profileSessionSampleRate",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("points the browser at our own path, which is a same-origin route", () => {
    expect(TUNNEL_PATH).toBe("/api/monitoring");
  });
});
