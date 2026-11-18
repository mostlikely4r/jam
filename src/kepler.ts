/**
 * One orbit's maths, shared by the sim, the designer and the chart so they cannot disagree.
 * Pure: no world, no sim. There is no gravity in the game; this only says where a thing is on
 * an ellipse and how fast it's moving, with the speeds a real orbit has: fast near the parent,
 * slow far from it. The parent sits at a focus.
 *
 * A circle (`eccentricity` 0) is worked out the way the game always has, so nothing that is
 * circular moves a pixel.
 */

/** An ellipse round a parent at one focus, and where on it a thing is at clock 0. */
export interface OrbitShape {
  /** Semi-major axis: half the long width. At eccentricity 0, the radius. */
  radius: number;
  /** 0 is a circle. Always below 1. */
  eccentricity: number;
  /** Direction from the parent to the closest point, in radians. Means nothing for a circle. */
  periapsis: number;
  /** Mean longitude at clock 0, in radians: the periapsis angle plus the mean anomaly. For a circle, just the angle. */
  phase: number;
  /** Seconds per lap. Zero stands still; negative goes the other way round. */
  period: number;
}

/** The most eccentric an orbit may be. Past this the far side is too slow and the near side too quick to be useful. */
export const MAX_ECCENTRICITY = 0.9;

const TAU = Math.PI * 2;

/** Radians per second for a period in seconds. Zero stands still. */
export function meanMotion(period: number): number {
  return period !== 0 ? TAU / period : 0;
}

/** An eccentricity the maths can use: finite, and from 0 to `MAX_ECCENTRICITY`. */
export function clampEccentricity(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_ECCENTRICITY, Math.max(0, value)) : 0;
}

/** Solves `M = E − e sin E` for E by Newton's method. */
export function eccentricAnomaly(mean: number, e: number): number {
  // Wrapped to −π..π, where the start below is close.
  const m = mean - TAU * Math.round(mean / TAU);
  let big = e > 0.8 ? Math.PI * Math.sign(m || 1) : m + e * Math.sin(m);
  for (let i = 0; i < 30; i++) {
    const step = (big - e * Math.sin(big) - m) / (1 - e * Math.cos(big));
    big -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return big;
}

/** Where a thing is on its orbit at a time, relative to the parent, and how fast it's going. */
export function orbitState(shape: OrbitShape, time: number): { x: number; y: number; vx: number; vy: number } {
  const { radius, eccentricity: e, periapsis, phase, period } = shape;
  const rate = meanMotion(period);
  if (e === 0) {
    const angle = phase + rate * time;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: -Math.sin(angle) * radius * rate, vy: Math.cos(angle) * radius * rate };
  }
  const big = eccentricAnomaly(phase - periapsis + rate * time, e);
  const cosE = Math.cos(big);
  const sinE = Math.sin(big);
  const minor = Math.sqrt(1 - e * e);
  // In the ellipse's own axes, the x axis towards the closest point.
  const px = radius * (cosE - e);
  const py = radius * minor * sinE;
  const sweep = rate / (1 - e * cosE);
  const pvx = -radius * sinE * sweep;
  const pvy = radius * minor * cosE * sweep;
  const cos = Math.cos(periapsis);
  const sin = Math.sin(periapsis);
  return { x: px * cos - py * sin, y: px * sin + py * cos, vx: pvx * cos - pvy * sin, vy: pvx * sin + pvy * cos };
}

/** The closest and farthest the thing gets from the parent. */
export function orbitReach(shape: Pick<OrbitShape, "radius" | "eccentricity">): { near: number; far: number } {
  return { near: shape.radius * (1 - shape.eccentricity), far: shape.radius * (1 + shape.eccentricity) };
}

/** Speed at the closest and at the farthest point, in units per second. */
export function orbitSpeeds(shape: Pick<OrbitShape, "radius" | "eccentricity" | "period">): { near: number; far: number } {
  const base = Math.abs(meanMotion(shape.period)) * shape.radius;
  const e = shape.eccentricity;
  return { near: base * Math.sqrt((1 + e) / (1 - e)), far: base * Math.sqrt((1 - e) / (1 + e)) };
}

/** The drawn ellipse: its centre relative to the parent (which is at a focus), its half-widths, and the turn of its long axis. */
export function orbitEllipse(shape: Pick<OrbitShape, "radius" | "eccentricity" | "periapsis">): {
  cx: number;
  cy: number;
  a: number;
  b: number;
  rotation: number;
} {
  const { radius, eccentricity: e, periapsis } = shape;
  return {
    cx: -radius * e * Math.cos(periapsis),
    cy: -radius * e * Math.sin(periapsis),
    a: radius,
    b: radius * Math.sqrt(1 - e * e),
    rotation: periapsis,
  };
}

/**
 * The mean longitude at clock 0 that puts a thing in a direction from its parent at a time:
 * for turning a point the author picked into the number the orbit is stored by.
 */
export function phaseToward(direction: number, time: number, shape: Pick<OrbitShape, "eccentricity" | "periapsis" | "period">): number {
  const e = shape.eccentricity;
  const along = direction - shape.periapsis;
  // True anomaly to eccentric to mean.
  const big = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(along / 2), Math.sqrt(1 + e) * Math.cos(along / 2));
  const mean = big - e * Math.sin(big);
  return shape.periapsis + mean - meanMotion(shape.period) * time;
}

/** The direction from the parent to the thing at a time. */
export function directionAt(shape: OrbitShape, time: number): number {
  const { x, y } = orbitState(shape, time);
  return Math.atan2(y, x);
}
