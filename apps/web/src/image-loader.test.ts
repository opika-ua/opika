import { describe, expect, it } from "vitest";
import opikaImageLoader from "./image-loader";

describe("opikaImageLoader", () => {
  it("turns a storage key into a root-relative URL", () => {
    expect(opikaImageLoader({ src: "seed-photos/dog-1.jpg", width: 640, quality: 75 })).toBe(
      "/seed-photos/dog-1.jpg",
    );
  });

  it("ignores width and quality — this stub has no real variants yet", () => {
    const a = opikaImageLoader({ src: "seed-photos/cat-1.jpg", width: 640, quality: 75 });
    const b = opikaImageLoader({ src: "seed-photos/cat-1.jpg", width: 3840, quality: 75 });
    expect(a).toBe(b);
  });
});
