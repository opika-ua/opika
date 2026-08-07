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

  /**
   * `loaderFile` is global — it runs for every `next/image` in the app, and
   * every src that is not one of our storage keys arrives already
   * root-relative. Prefixing one of those again produces the
   * protocol-relative `//…`, i.e. an off-site request to a host named after
   * the file.
   */
  it.each([
    ["/icon.svg", "a public/ asset written the idiomatic Next way"],
    ["/_next/static/media/logo.9a1f2b.png", "a statically imported asset"],
  ])("leaves %s alone — %s", (src) => {
    const out = opikaImageLoader({ src, width: 640, quality: 75 });
    expect(out).toBe(src);
    expect(out.startsWith("//")).toBe(false);
  });

  /**
   * H1's whole job is to make this function return one of these instead of a
   * root-relative path — without this passthrough, the stub would prefix
   * H1's own CDN URL and break the thing it exists to become. Same failure
   * shape as the `//icon.svg` case above: `startsWith("/")` is false for
   * `https://…`, so without this branch the naive prefix rule would turn it
   * into `/https://cdn.example/x.jpg`.
   */
  it.each([
    ["https://cdn.opika.example/photo.jpg", "an absolute https URL"],
    ["http://cdn.opika.example/photo.jpg", "an absolute http URL"],
    ["data:image/png;base64,iVBORw0KGgo=", "a data URI"],
  ])("passes %s through unchanged — %s", (src) => {
    expect(opikaImageLoader({ src, width: 640, quality: 75 })).toBe(src);
  });
});
