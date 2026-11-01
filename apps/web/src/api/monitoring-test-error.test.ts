import { describe, expect, it } from "vitest";
import { handleMonitoringTestError } from "./monitoring-test-error";

const SECRET = "s".repeat(40);
const DSN = "https://publickey@o1.ingest.de.sentry.io/1";
const call = (authorization?: string) =>
  new Request("https://opika.example/api/monitoring/test", {
    method: "POST",
    ...(authorization === undefined ? {} : { headers: { authorization } }),
  });

describe("the owner's test-error route", () => {
  it("throws on purpose for the exact bearer secret", async () => {
    await expect(
      handleMonitoringTestError(call(`Bearer ${SECRET}`), { cronSecret: SECRET, dsn: DSN }),
    ).rejects.toThrow("Sentry test error");
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${"x".repeat(40)}`],
    ["no Bearer word", SECRET],
  ])("is a plain 404 with %s", async (_label, header) => {
    const response = await handleMonitoringTestError(call(header), {
      cronSecret: SECRET,
      dsn: DSN,
    });
    expect(response.status).toBe(404);
  });

  it("is 404 without a DSN or without a configured secret, even with a matching header", async () => {
    expect(
      (
        await handleMonitoringTestError(call(`Bearer ${SECRET}`), {
          cronSecret: SECRET,
          dsn: undefined,
        })
      ).status,
    ).toBe(404);
    expect(
      (await handleMonitoringTestError(call("Bearer "), { cronSecret: undefined, dsn: DSN }))
        .status,
    ).toBe(404);
    expect(
      (await handleMonitoringTestError(call("Bearer "), { cronSecret: "", dsn: DSN })).status,
    ).toBe(404);
  });
});
