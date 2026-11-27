/**
 * The snapshot a ship hands its art, and the plain rules it's made from: closing on a dock, running
 * low, a shot's flash, a driven spin's easing and an approach's hold.
 */
import { describe, expect, it } from "vitest";
import { APPROACH_HOLD, APPROACH_MIN_CLOSING, closingDistance, easeSpeed, firedLit, holdApproach, isLow, shipArtState, SPIN_EASE, SpinMemory } from "./artState";
import { tankCapacity, type ArtShape, type ShapeBlink } from "./fitting";
import { homeSim } from "./home";
import { roundTrip } from "./save";
import { TICK, type Sim } from "./sim";
import { DEFAULTS } from "./tuning";
import { frameMountSpot } from "./frameParts";

/** Where the station frame's dock sits from its middle, along its own axis. */
const DOCK_OFFSET = frameMountSpot("station", "dock")!.x;

const WORLD = { ...DEFAULTS, trafficRacers: 0, trafficFloaters: 0, pirates: 0, defenders: 0, testDrones: 0, rockCount: 0, stationUnlocks: false };

/** A dock that stays where it is. */
const still = (x: number, y: number) => ({ now: { x, y }, before: { x, y } });

describe("closing on a dock", () => {
  it("gives the distance to a dock the ship flies at, and nothing for one it leaves or sits by", () => {
    const dock = still(300, 0);
    expect(closingDistance({ x: 0, y: 0, vx: 50, vy: 0 }, [dock], TICK)).toBe(300);
    expect(closingDistance({ x: 0, y: 0, vx: -50, vy: 0 }, [dock], TICK)).toBe(Infinity);
    // Holding still beside it, or drifting past too slowly to count.
    expect(closingDistance({ x: 0, y: 0, vx: 0, vy: 0 }, [dock], TICK)).toBe(Infinity);
    expect(closingDistance({ x: 0, y: 0, vx: APPROACH_MIN_CLOSING / 2, vy: 0 }, [dock], TICK)).toBe(Infinity);
    // Sitting in it, whatever it's doing.
    expect(closingDistance({ x: 300, y: 0, vx: 50, vy: 0 }, [dock], TICK)).toBe(Infinity);
  });

  it("counts a dock coming toward a ship that's still, since stations move", () => {
    const coming = { now: { x: 300, y: 0 }, before: { x: 300 + 40 * TICK, y: 0 } };
    expect(closingDistance({ x: 0, y: 0, vx: 0, vy: 0 }, [coming], TICK)).toBeCloseTo(300, 6);
    // And a ship keeping pace with its dock isn't closing on it.
    expect(closingDistance({ x: 0, y: 0, vx: -40, vy: 0 }, [coming], TICK)).toBe(Infinity);
  });

  it("takes the nearest of the docks it's closing on", () => {
    const docks = [still(500, 0), still(200, 0), still(-100, 0)];
    // Closing on the two ahead, leaving the one behind, which is nearest of all.
    expect(closingDistance({ x: 0, y: 0, vx: 50, vy: 0 }, docks, TICK)).toBe(200);
  });
});

describe("running low", () => {
  it("is at or under the line, empty included, and never for an item it hasn't got", () => {
    expect(isLow(0.25)).toBe(true);
    expect(isLow(0.1)).toBe(true);
    expect(isLow(0)).toBe(true);
    expect(isLow(0.26)).toBe(false);
    expect(isLow(undefined)).toBe(false);
    expect(isLow(0.4, 0.5)).toBe(true);
  });
});

describe("a shot's flash", () => {
  const blink: ShapeBlink = { colour: "#ffffff", on: 0.2, off: 1 };
  it("snaps on for its length and off after", () => {
    expect([0, 0.1, 0.19, 0.2, 1].map((t) => firedLit(blink, t))).toEqual([1, 1, 1, 0, 0]);
    expect(firedLit(blink, undefined)).toBe(0);
  });
  it("dies away over its length with a fade", () => {
    const fade = { ...blink, fade: true };
    expect(firedLit(fade, 0)).toBe(1);
    expect(firedLit(fade, 0.1)).toBeCloseTo(0.5, 6);
    expect(firedLit(fade, 0.2)).toBe(0);
  });
});

describe("a driven spin's easing", () => {
  it("reaches its speed in about a second and never overshoots", () => {
    let speed = 0;
    const steps: number[] = [];
    for (let t = 0; t < 1.5; t += 0.1) {
      speed = easeSpeed(speed, 90, 0.1, 90);
      steps.push(speed);
    }
    expect(Math.max(...steps)).toBe(90);
    // Not there before its time, and there by it.
    expect(steps[Math.round(SPIN_EASE / 0.1) - 2]).toBeLessThan(90);
    expect(steps[Math.round(SPIN_EASE / 0.1)]).toBe(90);
  });

  it("winds down when its switch goes off, the other way round too", () => {
    expect(easeSpeed(90, 0, 0.5, 90)).toBeCloseTo(45, 6);
    expect(easeSpeed(45, 0, 0.5, 90)).toBe(0);
    expect(easeSpeed(-90, 0, 0.25, -90)).toBeCloseTo(-67.5, 6);
  });

  it("is kept for each shape and mount, easing between the frames it's drawn in", () => {
    const shape: ArtShape = { kind: "rect", role: "body", x: 0, y: 0, w: 0.2, h: 0.1, spin: { speed: 90, drive: { state: "approach" } } };
    const memory = new SpinMemory();
    // First seen with its switch on: it's already turning.
    expect(memory.angle(shape, shape.spin!, "dish", 90, 0)).toBe(0);
    expect(memory.angle(shape, shape.spin!, "dish", 90, 0.1)).toBeCloseTo(9, 6);
    // The switch goes off: it keeps turning a little while it slows, then stops.
    const slowing: number[] = [];
    for (let t = 0.2; t < 2; t += 0.1) slowing.push(memory.angle(shape, shape.spin!, "dish", 0, t));
    expect(slowing[1] - slowing[0]).toBeGreaterThan(0);
    expect(slowing[1] - slowing[0]).toBeLessThan(9);
    expect(slowing.at(-1)).toBeCloseTo(slowing.at(-2)!, 6);
    // The same shape on another mount turns on its own.
    expect(memory.angle(shape, shape.spin!, "other", 0, 2)).toBe(0);
  });
});

describe("the approach's hold", () => {
  it("keeps the approach lit half a second after it stops being true", () => {
    const lit = holdApproach(250, undefined, 10);
    expect(lit.distance).toBe(250);
    expect(holdApproach(Infinity, lit, 10 + APPROACH_HOLD / 2).distance).toBe(250);
    expect(holdApproach(Infinity, lit, 10 + APPROACH_HOLD + 0.01).distance).toBe(Infinity);
    // And picks up a new one at once.
    expect(holdApproach(120, lit, 10.1).distance).toBe(120);
  });
});

describe("a ship's snapshot", () => {
  /** The player's racer, parked beside its station's dock. */
  const docked = (fuel = true): Sim => {
    const sim = homeSim(1, { ...WORLD, fuel });
    sim.ship.x = sim.ship.px = sim.station.x + DOCK_OFFSET + 2000;
    sim.ship.y = sim.ship.py = sim.station.y;
    return sim;
  };

  it("reads fuel as how full the tanks are, and none without a tank or with fuel off", () => {
    const sim = docked();
    sim.ship.fuel = tankCapacity(sim.ship) / 4;
    expect(shipArtState(sim, sim.ship).supply.fuel).toBeCloseTo(0.25, 6);
    delete sim.ship.fit.tankLeft;
    delete sim.ship.fit.tankRight;
    expect(shipArtState(sim, sim.ship).supply.fuel).toBeUndefined();
    const off = docked(false);
    expect(shipArtState(off, off.ship).supply.fuel).toBeUndefined();
  });

  it("copies the thrusters' firing", () => {
    const sim = docked();
    sim.controls.thrust = 1;
    sim.step();
    expect(shipArtState(sim, sim.ship).thrust.thrusterMain).toBeGreaterThan(0);
    expect(shipArtState(sim, sim.ship).thrust.thrusterStrafeLeft).toBeUndefined();
  });

  it("sets a gun's shot to 0 when it fires, counts it up each tick, and forgets it on loading", () => {
    const sim = docked();
    expect(shipArtState(sim, sim.ship).shotAgo.gun).toBeUndefined();
    sim.controls.fire = true;
    sim.step();
    sim.controls.fire = false;
    const fired = shipArtState(sim, sim.ship).shotAgo.gun;
    expect(fired).toBeDefined();
    expect(fired!).toBeLessThan(TICK * 1.5);
    sim.step();
    expect(shipArtState(sim, sim.ship).shotAgo.gun).toBeCloseTo(fired! + TICK, 9);
    const loaded = homeSim(1, { ...WORLD, fuel: true });
    roundTrip(sim, loaded);
    expect(loaded.ship.shotAgo.size).toBe(0);
  });

  it("finds the dock the ship is closing on", () => {
    const sim = docked();
    expect(shipArtState(sim, sim.ship).approach).toBe(Infinity);
    const dock = sim.dockPoint(false, sim.station);
    sim.ship.x = dock.x - 400;
    sim.ship.y = dock.y;
    sim.ship.vx = 60 + (dock.x - sim.dockPoint(true, sim.station).x) / TICK;
    sim.ship.vy = (dock.y - sim.dockPoint(true, sim.station).y) / TICK;
    expect(shipArtState(sim, sim.ship).approach).toBeCloseTo(400, 3);
  });
});
