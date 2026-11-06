import { describe, expect, it } from "vitest";
import { type UnreachableLine, unreachableWarner } from "./rate-limit-unreachable";

describe("unreachableWarner", () => {
  it("warns once a minute and counts what it held back, with no key or error text", () => {
    const lines: UnreachableLine[] = [];
    const warn = unreachableWarner((line) => lines.push(line));
    warn("api", "error", 0);
    warn("api", "error", 1_000);
    warn("other", "timeout", 59_999);
    expect(lines).toEqual([
      { event: "rate_limiter_unreachable", limiter: "api", reason: "error", suppressed: 0 },
    ]);
    warn("api", "timeout", 60_000);
    expect(lines[1]).toEqual({
      event: "rate_limiter_unreachable",
      limiter: "api",
      reason: "timeout",
      suppressed: 2,
    });
  });
});
