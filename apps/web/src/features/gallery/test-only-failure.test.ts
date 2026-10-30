import { describe, expect, it } from "vitest";
import { galleryTestFailureRequested, throwIfGalleryTestFailure } from "./test-only-failure";

const ASK = { opika_test_fail: "1" };
const ARMED = { OPIKA_TEST_FAIL_GALLERY: "1" };

describe("gallery test-only failure hook", () => {
  it("fails only when the env var is set AND the request asks for it", () => {
    expect(galleryTestFailureRequested(ARMED, ASK)).toBe(true);
    expect(() => throwIfGalleryTestFailure(ARMED, ASK)).toThrow();
  });

  it("never fails without the env var, or without the request parameter", () => {
    expect(galleryTestFailureRequested({}, ASK)).toBe(false);
    expect(galleryTestFailureRequested({ OPIKA_TEST_FAIL_GALLERY: "0" }, ASK)).toBe(false);
    expect(galleryTestFailureRequested(ARMED, {})).toBe(false);
    expect(galleryTestFailureRequested(ARMED, { opika_test_fail: ["1", "1"] })).toBe(false);
    expect(() => throwIfGalleryTestFailure(ARMED, {})).not.toThrow();
  });

  it("never fails on a Vercel deployment, even with the env var and the parameter", () => {
    expect(galleryTestFailureRequested({ ...ARMED, VERCEL: "1" }, ASK)).toBe(false);
    expect(galleryTestFailureRequested({ ...ARMED, VERCEL_ENV: "production" }, ASK)).toBe(false);
    expect(() =>
      throwIfGalleryTestFailure(
        { ...ARMED, VERCEL_ENV: "production", NODE_ENV: "production" },
        ASK,
      ),
    ).not.toThrow();
  });
});
