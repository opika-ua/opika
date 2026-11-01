import { beforeEach, describe, expect, it } from "vitest";
import { SAVED_PREPAINT_SCRIPT } from "./saved-prepaint";

const run = () => new Function(SAVED_PREPAINT_SCRIPT)();
const flag = () => document.documentElement.hasAttribute("data-has-saved");

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-has-saved");
});

describe("the pre-paint saved flag", () => {
  it("is set when the likes store holds items", () => {
    window.localStorage.setItem(
      "likes.v1",
      JSON.stringify({ version: 1, items: [{ animalId: "a", likedAt: "2026-11-01T00:00:00Z" }] }),
    );
    run();
    expect(flag()).toBe(true);
  });

  it.each([
    ["nothing stored", null],
    ["an empty list", JSON.stringify({ version: 1, items: [] })],
    ["broken JSON", "{not json"],
  ])("stays unset for %s, and never throws", (_name, raw) => {
    if (raw !== null) window.localStorage.setItem("likes.v1", raw);
    expect(run).not.toThrow();
    expect(flag()).toBe(false);
  });
});
