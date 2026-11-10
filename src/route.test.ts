import { describe, expect, it } from "vitest";
import { pathAround, planRoute, travelTime, type Vec } from "./route";

const R = 1000;

function closest(points: Vec[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(a.x + dx * t, a.y + dy * t));
  }
  return best;
}

describe("path around a body", () => {
  it("goes straight when nothing is in the way", () => {
    const path = pathAround({ x: 2000, y: 1500 }, { x: -2000, y: 1500 }, R);
    expect(path.bends).toBe(false);
    expect(path.length).toBeCloseTo(4000, 6);
  });

  it("bends round from one side to the other, keeping out", () => {
    const path = pathAround({ x: -2 * R, y: 0 }, { x: 2 * R, y: 0 }, R);
    expect(path.bends).toBe(true);
    expect(closest(path.points)).toBeGreaterThanOrEqual(R - 1e-6);
    // Two tangents and a third of the circle.
    const shortest = 2 * Math.sqrt(3) * R + (R * Math.PI) / 3;
    expect(path.length).toBeGreaterThan(shortest);
    expect(path.length).toBeLessThan(shortest * 1.01);
  });

  it("takes the shorter way round", () => {
    const at = (degrees: number) => ({ x: Math.cos((degrees * Math.PI) / 180) * 2 * R, y: Math.sin((degrees * Math.PI) / 180) * 2 * R });
    for (const [a, b] of [[0, 150], [150, 0], [-20, -170]]) {
      const path = pathAround(at(a), at(b), R);
      const middle = path.points[Math.floor(path.points.length / 2)];
      const angle = (Math.atan2(middle.y, middle.x) * 180) / Math.PI;
      // The middle of the short way lies between the two, not on the far side.
      expect(Math.abs(angle - (a + b) / 2)).toBeLessThan(40);
    }
  });

  it("keeps out of what fits when it starts inside", () => {
    const path = pathAround({ x: -600, y: 0 }, { x: 3000, y: 0 }, R);
    expect(path.clipped).toBe(true);
    expect(closest(path.points)).toBeGreaterThan(590);
  });
});

describe("travel time", () => {
  it("burns half way and brakes the rest without a cruise speed", () => {
    expect(travelTime(10000, { accel: 100, cruise: Infinity })).toBeCloseTo(20, 6);
  });

  it("coasts at cruise speed in the middle of a long trip", () => {
    // 1,000 to reach 100, 1,000 to stop, 8,000 at 100.
    expect(travelTime(10000, { accel: 5, cruise: 100 })).toBeCloseTo(80 + 40, 6);
  });
});

describe("route to a moving place", () => {
  const flight = { accel: 84, cruise: Infinity };

  it("matches the plain trip time for a place standing still", () => {
    const route = planRoute(() => ({ x: 3000, y: 0 }), () => ({ x: 3000, y: 20000 }), 0, R, flight);
    expect(route.arrive).toBeCloseTo(travelTime(20000, flight), 1);
  });

  it("aims at where the place will be, and the times agree", () => {
    const orbit = (radius: number, period: number, phase: number) => (t: number) => ({
      x: Math.cos(phase + (2 * Math.PI * t) / period) * radius,
      y: Math.sin(phase + (2 * Math.PI * t) / period) * radius,
    });
    const start = orbit(40000, 3600, 0);
    const target = orbit(70000, 7000, Math.PI);
    const route = planRoute(start, target, 100, 12000, flight);
    expect(route.settled).toBe(true);
    const there = target(route.arrive);
    expect(route.aim.x).toBeCloseTo(there.x, 6);
    expect(route.path.bends).toBe(true);
    const trip = travelTime(route.path.length, flight) + route.matching;
    expect(route.arrive - route.depart).toBeCloseTo(trip, 0);
  });
});
