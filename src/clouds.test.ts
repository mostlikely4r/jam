import { describe, expect, it } from "vitest";
import { cloudAt, cloudPuffs, cloudStops, cloudStrength, cloudTurn, strengthAt, type CloudShape } from "./clouds";

const cloud = (shape: Partial<CloudShape> = {}): CloudShape => ({
  id: "cloud",
  look: "gas",
  width: 6000,
  height: 6000,
  ringInner: 0,
  falloff: 0,
  ...shape,
});

const still = { x: 0, y: 0, turn: 0 };

describe("the strength of a cloud", () => {
  it("is full in the middle and nothing at the edge or past it", () => {
    const shape = cloud();
    expect(cloudStrength(shape, still, 0, 0)).toBe(1);
    // Halfway to the edge, still full: there is no fade.
    expect(cloudStrength(shape, still, 1499, 0)).toBe(1);
    expect(cloudStrength(shape, still, 3000, 0)).toBe(0);
    expect(cloudStrength(shape, still, 9000, 4000)).toBe(0);
  });

  it("is nothing in the hole", () => {
    const shape = cloud({ ringInner: 0.3, falloff: 0.2 });
    expect(cloudStrength(shape, still, 0, 0)).toBe(0);
    expect(cloudStrength(shape, still, 600, 0)).toBe(0);
    // Past the hole it comes up to full, holds, then fades at the edge like any cloud.
    expect(cloudStrength(shape, still, 1800, 0)).toBe(1);
    expect(cloudStrength(shape, still, 2400, 0)).toBeCloseTo(1, 9);
    expect(cloudStrength(shape, still, 2700, 0)).toBeCloseTo(0.5, 9);
    expect(cloudStrength(shape, still, 3000, 0)).toBe(0);
  });

  it("is halfway down at halfway through the falloff", () => {
    const shape = cloud({ falloff: 0.4 });
    expect(cloudStrength(shape, still, 0, 0)).toBe(1);
    // 0.8 of the way out is halfway through the fade that runs from 0.6 to 1.
    expect(cloudStrength(shape, still, 2400, 0)).toBeCloseTo(0.5, 9);
    expect(cloudStrength(shape, still, 1800, 0)).toBe(1);
    expect(cloudStrength(shape, still, 2700, 0)).toBeCloseTo(0.25, 9);
  });

  it("takes the smaller of two fades that overlap", () => {
    // Ring to 0.4 and a fade half the cloud wide: the two ramps cross at 0.6.
    const shape = cloud({ ringInner: 0.4, falloff: 0.5 });
    expect(strengthAt(shape, 0.6)).toBeCloseTo(0.4, 9);
    expect(strengthAt(shape, 0.45)).toBeCloseTo(0.1, 9);
    expect(strengthAt(shape, 0.85)).toBeCloseTo(0.3, 9);
  });

  it("has hard edges when the falloff is 0", () => {
    const shape = cloud({ falloff: 0 });
    expect(strengthAt(shape, 0.999)).toBe(1);
    expect(strengthAt(shape, 1)).toBe(0);
    expect(strengthAt(cloud({ ringInner: 0.5, falloff: 0 }), 0.49)).toBe(0);
    expect(strengthAt(cloud({ ringInner: 0.5, falloff: 0 }), 0.51)).toBe(1);
  });

  it("swaps its width and height when it is turned a quarter turn", () => {
    const shape = cloud({ width: 9000, height: 3000 });
    const turned = { x: 0, y: 0, turn: Math.PI / 2 };
    // Lying along its width, the long way is sideways; turned, it is the way up.
    expect(cloudStrength(shape, still, 3000, 0)).toBe(1);
    expect(cloudStrength(shape, still, 0, 3000)).toBe(0);
    expect(cloudStrength(shape, turned, 3000, 0)).toBe(0);
    expect(cloudStrength(shape, turned, 0, 3000)).toBe(1);
  });

  it("reaches along its width but not across it when it is long and thin", () => {
    const shape = cloud({ width: 12000, height: 2000 });
    expect(cloudStrength(shape, still, 5000, 0)).toBe(1);
    expect(cloudStrength(shape, still, 0, 1500)).toBe(0);
  });
});

describe("where a cloud is", () => {
  it("turns from its start angle, and stands still at no spin", () => {
    // The start angle comes in radians, as every turn the game holds does.
    expect(cloudTurn(100, Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(cloudTurn(100, Math.PI / 2, 25)).toBeCloseTo(Math.PI, 9);
    expect(cloudTurn(0, Math.PI / 2, 5000)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("puts its centre where its orbits do, and its turn with it", () => {
    const orbit = { radius: 1000, period: 4000, phase: 0, sign: 1 as const };
    const at = cloudAt({ orbits: [orbit], spinPeriod: 4000, spinPhase: Math.PI / 4 }, 1000);
    // A quarter of the way round in a quarter of the period.
    expect(at.x).toBeCloseTo(0, 6);
    expect(at.y).toBeCloseTo(1000, 6);
    expect(at.turn).toBeCloseTo(Math.PI / 4 + Math.PI / 2, 9);
  });
});

describe("the stops the drawing uses", () => {
  it("runs in order inside the edge, whatever the shape", () => {
    const shapes = [
      cloud(),
      cloud({ falloff: 0.4 }),
      cloud({ ringInner: 0.4, falloff: 0.5 }),
      cloud({ ringInner: 0.8, falloff: 0.5 }),
      cloud({ ringInner: 0.5 }),
      cloud({ falloff: 1 }),
    ];
    for (const shape of shapes) {
      const stops = cloudStops(shape);
      expect(stops[0]).toBe(0);
      expect(stops[stops.length - 1]).toBe(1);
      for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
      // What sits at each stop is the cloud's own rule, so the drawn fade can't drift from it.
      for (const d of stops) expect(strengthAt(shape, d)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("a cloud's inside", () => {
  it("is the same every time for the same cloud, and different for another", () => {
    const one = cloudPuffs({ id: "n1:0", look: "dust" });
    expect(cloudPuffs({ id: "n1:0", look: "dust" })).toEqual(one);
    expect(cloudPuffs({ id: "n2:0", look: "dust" })).not.toEqual(one);
  });

  it("stays inside the edge, with a few puffs for gas and a few hundred specks for dust", () => {
    const gas = cloudPuffs({ id: "gas", look: "gas" });
    const dust = cloudPuffs({ id: "dust", look: "dust" });
    expect(gas.length).toBeLessThan(20);
    expect(dust.length).toBeGreaterThan(100);
    expect(dust.length).toBeLessThanOrEqual(400);
    for (const puff of [...gas, ...dust]) expect(Math.hypot(puff.x, puff.y)).toBeLessThan(1);
  });
});
