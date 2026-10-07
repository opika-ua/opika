/**
 * The deck's one spring — `docs/design/README.md`: "The only spring is the
 * deck's: stiffness `280`, damping `30`, no overshoot", and in the deck's own
 * gesture spec, "return is the spring 280/30, no overshoot".
 *
 * Mass is 1, the convention those two numbers come from (React Native's
 * `Animated.spring`, Framer Motion). At mass 1 the pair is slightly
 * *under*-damped: critical damping would be 2·√280 ≈ 33.5, so ζ ≈ 0.90 and
 * the free motion crosses the origin. "No overshoot" is therefore not a
 * property of the numbers. It is a separate constraint, the same one React
 * Native calls `overshootClamping`: the return ends the instant the card
 * reaches the origin rather than crossing it. Raising damping to make the
 * free motion stop short instead would change the curve the design chose.
 */
export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export const DECK_RETURN_SPRING: SpringConfig = { stiffness: 280, damping: 30, mass: 1 };

/** Position in px and velocity in px/s. */
export interface SpringSample {
  readonly x: number;
  readonly v: number;
}

/**
 * Below these the spring is at rest. Only reachable in the critically damped
 * and overdamped regimes, which approach the origin without crossing it; an
 * underdamped return always ends at its first crossing. Half a pixel is below
 * anything a transform can show.
 */
const REST_DISPLACEMENT_PX = 0.5;
const REST_SPEED_PX_PER_S = 5;

/**
 * Closed-form state of `m·x'' + c·x' + k·x = 0` at `t` seconds, from `x0`
 * (px) moving at `v0` (px/s).
 *
 * Closed form rather than stepping an integrator per frame, so the position
 * depends only on elapsed time. A dropped frame, a throttled background tab
 * or a slow device moves the card to where the spring *is*, not to where a
 * frame-counting integrator has fallen behind to, and a test can ask for the
 * position at any instant without simulating the frames in between.
 */
export function springAt(config: SpringConfig, x0: number, v0: number, t: number): SpringSample {
  const { stiffness: k, damping: c, mass: m } = config;
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * t);
    const cos = Math.cos(omegaD * t);
    const sin = Math.sin(omegaD * t);
    return {
      x: decay * (x0 * cos + ((v0 + zeta * omega0 * x0) / omegaD) * sin),
      v: decay * (v0 * cos - ((omega0 * omega0 * x0 + zeta * omega0 * v0) / omegaD) * sin),
    };
  }

  if (zeta === 1) {
    const decay = Math.exp(-omega0 * t);
    const b = v0 + omega0 * x0;
    return { x: (x0 + b * t) * decay, v: (v0 - omega0 * b * t) * decay };
  }

  const root = omega0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega0 + root;
  const r2 = -zeta * omega0 - root;
  const c1 = (v0 - r2 * x0) / (r1 - r2);
  const c2 = x0 - c1;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { x: c1 * e1 + c2 * e2, v: c1 * r1 * e1 + c2 * r2 * e2 };
}

export type ReturnFrame =
  | { readonly kind: "moving"; readonly x: number }
  | { readonly kind: "at_rest" };

/**
 * A return to the origin with overshoot clamped: the frame at `t` seconds
 * after release.
 *
 * Reaching or crossing the origin ends the motion there. The release
 * velocity is kept, which is what makes this a spring and not a curve: a
 * card let go while still moving outward carries on outward for a moment
 * before it turns, and a card flicked back toward the centre arrives sooner.
 */
export function returnToOrigin(
  config: SpringConfig,
  x0: number,
  v0: number,
): (t: number) => ReturnFrame {
  return (t) => {
    if (x0 === 0) return { kind: "at_rest" };
    const { x, v } = springAt(config, x0, v0, t);
    if (Math.sign(x) !== Math.sign(x0)) return { kind: "at_rest" };
    if (Math.abs(x) < REST_DISPLACEMENT_PX && Math.abs(v) < REST_SPEED_PX_PER_S) {
      return { kind: "at_rest" };
    }
    return { kind: "moving", x };
  };
}
