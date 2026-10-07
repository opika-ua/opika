import { describe, expect, it } from "vitest";
import { DECK_RETURN_SPRING, returnToOrigin, type SpringConfig, springAt } from "./spring";

/**
 * The equation the closed form claims to solve, checked numerically rather
 * than against a re-derivation of the same algebra: `m·x'' + c·x' + k·x`
 * must vanish, with `x''` taken as a central difference of the returned
 * velocity. A sign or factor error in any branch leaves a residual orders of
 * magnitude above the tolerance.
 */
function residual(config: SpringConfig, x0: number, v0: number, t: number): number {
  const h = 1e-5;
  const { x, v } = springAt(config, x0, v0, t);
  const a = (springAt(config, x0, v0, t + h).v - springAt(config, x0, v0, t - h).v) / (2 * h);
  return config.mass * a + config.damping * v + config.stiffness * x;
}

const REGIMES: readonly { name: string; config: SpringConfig }[] = [
  { name: "the deck's own 280/30 (underdamped)", config: DECK_RETURN_SPRING },
  // 2·√280 — the exact boundary between the two branches.
  { name: "critically damped", config: { stiffness: 280, damping: 2 * Math.sqrt(280), mass: 1 } },
  { name: "overdamped", config: { stiffness: 280, damping: 60, mass: 1 } },
];

describe("springAt", () => {
  for (const { name, config } of REGIMES) {
    it(`solves the spring equation and honours the release state — ${name}`, () => {
      for (const [x0, v0] of [
        [88, 0],
        [-60, 900],
        [40, 400],
      ] as const) {
        const start = springAt(config, x0, v0, 0);
        expect(start.x).toBeCloseTo(x0, 9);
        expect(start.v).toBeCloseTo(v0, 9);
        for (const t of [0.01, 0.05, 0.12, 0.3]) {
          const r = residual(config, x0, v0, t);
          // Forces here are up to k·x ≈ 280·88 ≈ 25,000; a real error is that size.
          expect(Math.abs(r), `residual ${r} at t=${t}, x0=${x0}, v0=${v0}`).toBeLessThan(1);
        }
      }
    });
  }

  /**
   * Pins why `returnToOrigin` needs a clamp at all: the design's two numbers
   * alone overshoot. If someone retunes damping to ≥ 2·√280 this fails, and the
   * clamp's comment needs revisiting rather than silently becoming dead weight.
   */
  it("crosses the origin on its own at 280/30 — the free motion overshoots", () => {
    let crossed = false;
    for (let ms = 1; ms <= 1000; ms++) {
      if (springAt(DECK_RETURN_SPRING, 88, 0, ms / 1000).x < 0) crossed = true;
    }
    expect(crossed, "280/30 at mass 1 should be underdamped (ζ ≈ 0.90)").toBe(true);
  });
});

describe("returnToOrigin", () => {
  /**
   * "No overshoot", checked as the design states it: across releases on both
   * sides, from a nudge to a refused commit far past the 88px threshold, and
   * with release velocities toward and away from the centre up to well past
   * the 0.45 px/ms commit velocity, no rendered frame is ever on the far side
   * of the origin. Sampled every millisecond — finer than any display frame.
   */
  it("never renders the card past the origin", () => {
    for (const x0 of [-240, -88, -20, -1, 1, 20, 88, 240]) {
      for (const v0 of [-3000, -900, -450, 0, 450, 900, 3000]) {
        const frameAt = returnToOrigin(DECK_RETURN_SPRING, x0, v0);
        const moving: { ms: number; x: number }[] = [];
        for (let ms = 0; ms <= 2000; ms++) {
          const frame = frameAt(ms / 1000);
          if (frame.kind === "moving") moving.push({ ms, x: frame.x });
        }
        // Without this, a return that never moves at all — always `at_rest` —
        // would pass the check below by rendering nothing to check.
        expect(moving.length, `x0=${x0} v0=${v0} rendered no frames at all`).toBeGreaterThan(0);
        const pastOrigin = moving.find(({ x }) => Math.sign(x) !== Math.sign(x0));
        expect(
          pastOrigin,
          `x0=${x0} v0=${v0} rendered ${pastOrigin?.x}px at ${pastOrigin?.ms}ms — past the origin`,
        ).toBeUndefined();
      }
    }
  });

  it("comes to rest, and stays at rest, within half a second of an ordinary release", () => {
    for (const x0 of [-88, -20, 20, 88, 240]) {
      const frameAt = returnToOrigin(DECK_RETURN_SPRING, x0, 0);
      expect(frameAt(0.5).kind, `x0=${x0}`).toBe("at_rest");
      expect(frameAt(5).kind, `x0=${x0}`).toBe("at_rest");
    }
  });

  it("is still visibly moving shortly after release — a spring, not a jump", () => {
    const frame = returnToOrigin(DECK_RETURN_SPRING, 88, 0)(0.1);
    expect(frame.kind).toBe("moving");
    if (frame.kind !== "moving") return;
    expect(frame.x).toBeGreaterThan(10);
    expect(frame.x).toBeLessThan(88);
  });

  /** The release velocity is part of the motion, which a fixed CSS curve could never express. */
  it("carries an outward release velocity outward before turning back", () => {
    const frame = returnToOrigin(DECK_RETURN_SPRING, 40, 400)(0.02);
    expect(frame.kind).toBe("moving");
    if (frame.kind !== "moving") return;
    expect(frame.x, "a card let go while moving outward keeps going for a moment").toBeGreaterThan(
      40,
    );
  });

  it("arrives sooner when flicked back toward the centre", () => {
    const firstRest = (v0: number): number => {
      const frameAt = returnToOrigin(DECK_RETURN_SPRING, 60, v0);
      for (let ms = 0; ms <= 2000; ms++) if (frameAt(ms / 1000).kind === "at_rest") return ms;
      return Number.POSITIVE_INFINITY;
    };
    expect(firstRest(-600)).toBeLessThan(firstRest(0));
  });

  it("does nothing for a card that never left the origin", () => {
    expect(returnToOrigin(DECK_RETURN_SPRING, 0, 500)(0).kind).toBe("at_rest");
  });
});
