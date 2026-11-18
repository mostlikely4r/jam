import { describe, expect, it } from "vitest";
import { directionAt, eccentricAnomaly, orbitEllipse, orbitReach, orbitSpeeds, orbitState, phaseToward, type OrbitShape } from "./kepler";

const shape = (over: Partial<OrbitShape> = {}): OrbitShape => ({ radius: 10000, eccentricity: 0.5, periapsis: 0.7, phase: 1.1, period: 3600, ...over });
const speed = (s: OrbitShape, t: number) => {
  const at = orbitState(s, t);
  return Math.hypot(at.vx, at.vy);
};
const distance = (s: OrbitShape, t: number) => {
  const at = orbitState(s, t);
  return Math.hypot(at.x, at.y);
};

describe("orbitState", () => {
  it("is exactly the old circle at eccentricity 0, whatever the periapsis", () => {
    for (const t of [0, 1, 777.7, 123456]) {
      const s = shape({ eccentricity: 0, periapsis: 2.2 });
      const angle = s.phase + ((Math.PI * 2) / s.period) * t;
      const at = orbitState(s, t);
      expect(at.x).toBe(Math.cos(angle) * s.radius);
      expect(at.y).toBe(Math.sin(angle) * s.radius);
    }
  });

  it("flows on from a circle: a tiny eccentricity is almost the same place", () => {
    const circle = shape({ eccentricity: 0 });
    const nearly = shape({ eccentricity: 1e-9 });
    for (const t of [0, 500, 2500]) {
      const a = orbitState(circle, t);
      const b = orbitState(nearly, t);
      expect(b.x).toBeCloseTo(a.x, 3);
      expect(b.y).toBeCloseTo(a.y, 3);
    }
  });

  it("repeats after one period", () => {
    const s = shape();
    const a = orbitState(s, 321);
    const b = orbitState(s, 321 + s.period);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it("is closest at a(1 − e) and farthest at a(1 + e), speeds in that ratio", () => {
    const s = shape({ period: 1000 });
    let near = Infinity;
    let far = 0;
    let nearSpeed = 0;
    let farSpeed = 0;
    for (let t = 0; t < 1000; t += 0.05) {
      const d = distance(s, t);
      if (d < near) [near, nearSpeed] = [d, speed(s, t)];
      if (d > far) [far, farSpeed] = [d, speed(s, t)];
    }
    const reach = orbitReach(s);
    expect(near).toBeCloseTo(reach.near, -1);
    expect(far).toBeCloseTo(reach.far, -1);
    expect(nearSpeed / farSpeed).toBeCloseTo((1 + s.eccentricity) / (1 - s.eccentricity), 1);
    const speeds = orbitSpeeds(s);
    expect(speeds.near).toBeCloseTo(nearSpeed, 0);
    expect(speeds.far).toBeCloseTo(farSpeed, 0);
    expect(speeds.near / speeds.far).toBeCloseTo(3, 9);
  });

  it("puts the closest point towards the periapsis angle", () => {
    // Mean longitude equal to the periapsis angle is the mean anomaly 0: right at the closest point.
    const s = shape({ phase: 0.7, periapsis: 0.7 });
    const at = orbitState(s, 0);
    expect(Math.hypot(at.x, at.y)).toBeCloseTo(5000, 6);
    expect(Math.atan2(at.y, at.x)).toBeCloseTo(0.7, 9);
  });

  it("sweeps equal areas in equal times", () => {
    const s = shape({ eccentricity: 0.7 });
    const area = (from: number, to: number) => {
      let total = 0;
      const steps = 4000;
      for (let i = 0; i < steps; i++) {
        const a = orbitState(s, from + ((to - from) * i) / steps);
        const b = orbitState(s, from + ((to - from) * (i + 1)) / steps);
        total += (a.x * b.y - a.y * b.x) / 2;
      }
      return total;
    };
    // One slice near the closest point, one half a lap later.
    const near = area(-100, 100);
    const far = area(s.period / 2 - 100, s.period / 2 + 100);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    // Both are 200 s of a 3600 s lap, whatever the point: the same area.
    const whole = Math.PI * s.radius * s.radius * Math.sqrt(1 - s.eccentricity ** 2);
    expect(near / whole).toBeCloseTo(200 / s.period, 3);
    expect(far / whole).toBeCloseTo(200 / s.period, 3);
  });

  it("fits v² = μ(2/r − 1/a)", () => {
    const s = shape({ eccentricity: 0.6 });
    const n = (Math.PI * 2) / s.period;
    const mu = n * n * s.radius ** 3;
    for (const t of [0, 400, 1300, 2900]) {
      const r = distance(s, t);
      expect(speed(s, t) ** 2).toBeCloseTo(mu * (2 / r - 1 / s.radius), 3);
    }
  });

  it("has a velocity that matches the one found by sampling positions", () => {
    const s = shape({ eccentricity: 0.8 });
    const h = 0.01;
    for (const t of [0, 100, 1700, 3000]) {
      const before = orbitState(s, t - h);
      const after = orbitState(s, t + h);
      const at = orbitState(s, t);
      expect(at.vx).toBeCloseTo((after.x - before.x) / (2 * h), 3);
      expect(at.vy).toBeCloseTo((after.y - before.y) / (2 * h), 3);
    }
  });

  it("goes the other way round with a negative period, over the same ellipse", () => {
    const forward = shape();
    const back = shape({ period: -forward.period });
    const cross = (s: OrbitShape, t: number) => {
      const at = orbitState(s, t);
      return at.x * at.vy - at.y * at.vx;
    };
    expect(cross(forward, 100)).toBeGreaterThan(0);
    expect(cross(back, 100)).toBeLessThan(0);
    // Both stay on the one ellipse: the same distances from the focus over a lap.
    const sweep = (s: OrbitShape) => Array.from({ length: 40 }, (_, i) => Math.round(distance(s, (i * 3600) / 40) * 10) / 10).sort((a, b) => a - b);
    const a = sweep(forward);
    const b = sweep(back);
    // They start at the same place but run in opposite directions: compare extremes.
    expect(Math.min(...a)).toBeCloseTo(Math.min(...b), -1);
    expect(Math.max(...a)).toBeCloseTo(Math.max(...b), -1);
  });

  it("stands still with a period of 0", () => {
    const s = shape({ period: 0 });
    const a = orbitState(s, 0);
    const b = orbitState(s, 99999);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(a.vx).toBeCloseTo(0, 12);
    expect(a.vy).toBeCloseTo(0, 12);
  });

  it("converges near 0.9, and stays smooth across the wrap", () => {
    const s = shape({ eccentricity: 0.9 });
    for (let t = 0; t < 3600; t += 7.3) {
      const big = eccentricAnomaly(((Math.PI * 2) / s.period) * t + 0.3, 0.9);
      expect(big - 0.9 * Math.sin(big)).toBeCloseTo(((((Math.PI * 2) / s.period) * t + 0.3 + Math.PI) % (Math.PI * 2)) - Math.PI, 9);
    }
    let last = orbitState(s, 0);
    for (let t = 1; t < 3700; t++) {
      const at = orbitState(s, t);
      // A lap that stays whole: no step is bigger than the fastest speed gives.
      expect(Math.hypot(at.x - last.x, at.y - last.y)).toBeLessThan(orbitSpeeds(s).near * 1.5);
      last = at;
    }
  });
});

describe("orbitEllipse and phaseToward", () => {
  it("draws an ellipse that goes through where the thing is, with the parent at a focus", () => {
    const s = shape({ eccentricity: 0.6 });
    const { cx, cy, a, b, rotation } = orbitEllipse(s);
    expect(a).toBe(s.radius);
    expect(b).toBeCloseTo(s.radius * 0.8, 9);
    for (const t of [0, 300, 1200, 2500]) {
      const at = orbitState(s, t);
      const dx = at.x - cx;
      const dy = at.y - cy;
      const u = dx * Math.cos(rotation) + dy * Math.sin(rotation);
      const v = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
      expect((u / a) ** 2 + (v / b) ** 2).toBeCloseTo(1, 9);
    }
    // The focus (parent) is a·e from the centre.
    expect(Math.hypot(cx, cy)).toBeCloseTo(s.radius * 0.6, 9);
  });

  it("finds the start angle that puts a thing where the mouse was, at a time", () => {
    const s = shape({ eccentricity: 0.5 });
    for (const [direction, time] of [[2, 0], [-1.3, 900], [3, 2000]] as const) {
      const phase = phaseToward(direction, time, s);
      const at = directionAt({ ...s, phase }, time);
      expect(Math.cos(at)).toBeCloseTo(Math.cos(direction), 9);
      expect(Math.sin(at)).toBeCloseTo(Math.sin(direction), 9);
    }
  });
});
