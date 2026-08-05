import { describe, expect, it } from "vitest";
import { swipeDecision } from "./swipe-decision";

describe("swipeDecision", () => {
  // --- distance-based commits ---

  it("commits right when dx >= 88 px", () => {
    expect(swipeDecision(88, 0)).toEqual({ committed: true, direction: "right" });
    expect(swipeDecision(200, 0)).toEqual({ committed: true, direction: "right" });
  });

  it("commits left when dx <= -88 px", () => {
    expect(swipeDecision(-88, 0)).toEqual({ committed: true, direction: "left" });
    expect(swipeDecision(-150, 0)).toEqual({ committed: true, direction: "left" });
  });

  it("does not commit at 87 px (just under threshold)", () => {
    expect(swipeDecision(87, 0)).toEqual({ committed: false });
    expect(swipeDecision(-87, 0)).toEqual({ committed: false });
  });

  // --- velocity-based commits (fast short flick) ---

  it("commits right on a fast short flick (velocity >= 0.45 px/ms)", () => {
    expect(swipeDecision(30, 0.45)).toEqual({ committed: true, direction: "right" });
    expect(swipeDecision(10, 1.2)).toEqual({ committed: true, direction: "right" });
  });

  it("commits left on a fast short flick to the left", () => {
    expect(swipeDecision(-30, -0.45)).toEqual({ committed: true, direction: "left" });
    expect(swipeDecision(-10, -1.2)).toEqual({ committed: true, direction: "left" });
  });

  it("does not commit on a slow short flick (velocity < 0.45 px/ms)", () => {
    expect(swipeDecision(30, 0.44)).toEqual({ committed: false });
    expect(swipeDecision(-30, -0.44)).toEqual({ committed: false });
  });

  // --- slow long drag ---

  it("commits on a slow long drag past 88 px even with zero velocity", () => {
    expect(swipeDecision(100, 0)).toEqual({ committed: true, direction: "right" });
    expect(swipeDecision(-100, 0)).toEqual({ committed: true, direction: "left" });
  });

  // --- drag returning to origin ---

  it("snaps back when released near the origin", () => {
    expect(swipeDecision(0, 0)).toEqual({ committed: false });
    expect(swipeDecision(5, 0.1)).toEqual({ committed: false });
    expect(swipeDecision(-5, -0.1)).toEqual({ committed: false });
  });

  // --- direction is determined by dx sign, not velocity sign ---

  it("uses dx sign for direction even when velocity has opposite sign", () => {
    // User dragged right 90px but was decelerating (negative velocity)
    expect(swipeDecision(90, -0.1)).toEqual({ committed: true, direction: "right" });
  });
});
