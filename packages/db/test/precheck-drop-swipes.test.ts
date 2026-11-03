import { describe, expect, it } from "vitest";
import { precheckTarget, renderPrecheck } from "../src/tools/precheck-drop-swipes";

const URL = "postgres://u:p@ep-child-1.eu-central-1.aws.neon.tech/db";
const PROD = "ep-prod-9";

describe("renderPrecheck", () => {
  it("prints none for both queries and exits 0 when nothing depends on the table", () => {
    const r = renderPrecheck({ tablePresent: true, referencingTables: [], dependentObjects: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text.match(/none/g)).toHaveLength(2);
  });

  it("exits 1 with a STOP line on a referencing table or a dependent view", () => {
    for (const f of [
      { referencingTables: ["x"], dependentObjects: [] },
      { referencingTables: [], dependentObjects: ["v"] },
    ]) {
      const r = renderPrecheck({ tablePresent: true, ...f });
      expect(r.exitCode).toBe(1);
      expect(r.text).toContain("STOP");
    }
  });

  it("says so and exits 0 when the table does not exist", () => {
    const r = renderPrecheck({ tablePresent: false, referencingTables: [], dependentObjects: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("does not exist");
  });
});

describe("precheckTarget", () => {
  it("accepts the typed child endpoint", () => {
    expect(precheckTarget(URL, ["--expect", "ep-child-1"], PROD).kind).toBe("ok");
  });

  it.each([
    ["--prod", ["--expect", "ep-child-1", "--prod"], URL, PROD],
    ["an unset PROD_NEON_ENDPOINT", ["--expect", "ep-child-1"], URL, undefined],
    ["a wrong --expect", ["--expect", "ep-other-2"], URL, PROD],
    ["no --expect", [], URL, PROD],
    ["the production endpoint", ["--expect", "ep-prod-9"], URL.replace("child-1", "prod-9"), PROD],
    ["a non-Neon host", ["--expect", "ep-child-1"], "postgres://u:p@localhost/db", PROD],
    [
      "a pooled host whose compute is not the expected one",
      ["--expect", "ep-child-2"],
      URL.replace("ep-child-1", "ep-child-1-pooler"),
      PROD,
    ],
  ])("refuses %s", (_name, argv, url, prod) => {
    expect(precheckTarget(url, argv, prod).kind).toBe("refused");
  });
});
