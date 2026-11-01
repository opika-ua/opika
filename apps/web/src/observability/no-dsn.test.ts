// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string) => readFileSync(join(SRC, relative), "utf8");

/** `register()` also runs the app's own boot checks on Node; they are not what these tests are about. */
function stubBootChecks(): void {
  vi.doMock("../api/env", () => ({ validateEnv: vi.fn() }));
  vi.doMock("../api/per-ip-budgets", () => ({ servedPerIpBudgetSizes: vi.fn() }));
  vi.doMock("../seo-flags", () => ({ assertDemoDiscoverabilityInvariant: vi.fn() }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("./server");
  vi.doUnmock("./edge");
  vi.doUnmock("../api/env");
  vi.doUnmock("../api/per-ip-budgets");
  vi.doUnmock("../seo-flags");
  vi.doUnmock("@sentry/nextjs");
});

describe("without NEXT_PUBLIC_SENTRY_DSN the SDK is fully off", () => {
  it("the server hook initialises nothing and imports no SDK module", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    stubBootChecks();
    const initServerSentry = vi.fn();
    const sdkLoaded = vi.fn();
    vi.doMock("./server", () => {
      sdkLoaded();
      return { initServerSentry };
    });
    vi.doMock("@sentry/nextjs", () => {
      sdkLoaded();
      return { captureRequestError: vi.fn() };
    });
    const { register, onRequestError } = await import("../instrumentation");
    await register();
    await onRequestError(new Error("boom"), { path: "/x", method: "GET", headers: {} }, {
      routerKind: "App Router",
      routePath: "/x",
      routeType: "route",
      renderSource: undefined,
    } as never);
    expect(initServerSentry).not.toHaveBeenCalled();
    expect(sdkLoaded).not.toHaveBeenCalled();
  });

  it("with a DSN the server hook initialises the SDK once", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://k@o1.ingest.de.sentry.io/1");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    stubBootChecks();
    const initServerSentry = vi.fn();
    vi.doMock("./server", () => ({ initServerSentry }));
    const { register } = await import("../instrumentation");
    await register();
    expect(initServerSentry).toHaveBeenCalledExactlyOnceWith("https://k@o1.ingest.de.sentry.io/1");
  });

  it("no module on the page's eager path imports the SDK; only the lazy chunk does", () => {
    const importsSdk = /(?:from\s+|import\s*\(\s*)["']@sentry\//;
    const eager = [
      "instrumentation-client.ts",
      "observability/load-client.ts",
      "observability/dsn.ts",
    ];
    for (const file of eager) {
      const source = read(file);
      const staticSdkImport = /^import[^;]*from\s+["']@sentry\//m.test(source);
      expect(staticSdkImport, `${file} statically imports the SDK`).toBe(false);
      expect(importsSdk.test(source) && file !== "observability/load-client.ts").toBe(false);
    }
    // The browser SDK is reachable only through a dynamic import of ./client.
    expect(read("observability/load-client.ts")).toContain('import("./client")');
  });

  it("only observability/client.ts and server.ts import the SDK at runtime, outside the config and instrumentation", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          if (
            /from\s+["']@sentry\/nextjs(\/config)?["']/.test(source) &&
            !/^\s*import type/m.test(source.split("\n").find((l) => l.includes("@sentry")) ?? "")
          ) {
            offenders.push(full.slice(SRC.length + 1).replaceAll("\\", "/"));
          }
        }
      }
    };
    walk(SRC);
    expect(offenders.sort()).toEqual([
      "observability/client.ts",
      "observability/edge.ts",
      "observability/server.ts",
    ]);
  });
});
