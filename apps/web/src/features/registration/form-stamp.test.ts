import { describe, expect, it } from "vitest";
import { formStampVerdictOf, issueFormStamp, MAX_STAMP_AGE_MS, MIN_FILL_MS } from "./form-stamp";

const KEY = "test-key";
const ISSUED = new Date("2026-11-18T10:00:00.000Z");
const after = (ms: number) => new Date(ISSUED.getTime() + ms);

describe("the registration form's signed render time", () => {
  it("passes once the minimum fill time has gone by, and says when it was issued", () => {
    const stamp = issueFormStamp(ISSUED, KEY);
    expect(formStampVerdictOf(stamp, KEY, after(MIN_FILL_MS))).toEqual({
      kind: "ok",
      issuedAt: ISSUED,
    });
  });

  it("is too fast just under the minimum", () => {
    const stamp = issueFormStamp(ISSUED, KEY);
    expect(formStampVerdictOf(stamp, KEY, after(MIN_FILL_MS - 1)).kind).toBe("too_fast");
  });

  it("refuses a stamp signed with another key, a changed time, or none at all", () => {
    const stamp = issueFormStamp(ISSUED, KEY);
    expect(formStampVerdictOf(stamp, "other-key", after(60_000)).kind).toBe("invalid");
    const [, signature] = stamp.split(".");
    const earlier = `${ISSUED.getTime() - 60_000}.${signature}`;
    expect(formStampVerdictOf(earlier, KEY, after(60_000)).kind).toBe("invalid");
    expect(formStampVerdictOf("", KEY, after(60_000)).kind).toBe("invalid");
    expect(formStampVerdictOf("garbage", KEY, after(60_000)).kind).toBe("invalid");
  });

  it("refuses a stamp from the future and one older than its age cap", () => {
    const stamp = issueFormStamp(ISSUED, KEY);
    expect(formStampVerdictOf(stamp, KEY, after(-1)).kind).toBe("invalid");
    expect(formStampVerdictOf(stamp, KEY, after(MAX_STAMP_AGE_MS)).kind).toBe("ok");
    expect(formStampVerdictOf(stamp, KEY, after(MAX_STAMP_AGE_MS + 1)).kind).toBe("invalid");
  });
});
